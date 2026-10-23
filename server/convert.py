"""Convertit un .docx en PDF avec LibreOffice (mise à jour du sommaire incluse).
POST /pdf  (corps = fichier .docx)  ->  application/pdf
Variables : PORT (8787), ALLOW_ORIGIN (adresses du site, séparées par des virgules), MAX_MB (8),
            TIMEOUT_S (60), QUEUE_MAX (4), RATE_PER_MIN (6), TRUST_PROXY (1 si le serveur est derrière un proxy fiable)"""
import os, subprocess, tempfile, threading, time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import uno
from com.sun.star.beans import PropertyValue
from docx_check import check_docx

PORT = int(os.environ.get('PORT', 8787))
ORIGINS = [o.strip() for o in os.environ.get('ALLOW_ORIGIN', 'https://mondocpro-gamma.vercel.app').split(',') if o.strip()]
MAX = int(os.environ.get('MAX_MB', 8)) * 1024 * 1024
TIMEOUT = int(os.environ.get('TIMEOUT_S', 60))
RATE = int(os.environ.get('RATE_PER_MIN', 6))
TRUST_PROXY = os.environ.get('TRUST_PROXY') == '1'
LO_PORT = 2002
QUEUE = threading.BoundedSemaphore(int(os.environ.get('QUEUE_MAX', 4)))  # conversions en cours + en attente

def prop(name, value):
    p = PropertyValue(); p.Name = name; p.Value = value; return p

class Office:
    def __init__(self):
        self.proc = None; self.desktop = None; self.lock = threading.Lock()

    def start(self):
        if self.proc: self.proc.kill()
        self.proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', '--nologo', '--nodefault',
                                      f'--accept=socket,host=127.0.0.1,port={LO_PORT};urp;'],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(80):
            try:
                ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={LO_PORT};urp;StarOffice.ComponentContext'); break
            except Exception: time.sleep(0.5)
        else: raise RuntimeError('LibreOffice indisponible')
        self.desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)

    def to_pdf(self, docx: bytes) -> bytes:
        if not self.lock.acquire(timeout=TIMEOUT): raise TimeoutError('file d’attente pleine')
        try:
            for attempt in (1, 2):
                # garde-fou : si LibreOffice se fige sur un fichier, on le tue au bout de TIMEOUT secondes
                # (l'appel en cours échoue, le verrou est libéré, LibreOffice redémarre à la demande suivante)
                dog = None
                try:
                    if not self.desktop: self.start()
                    dog = threading.Timer(TIMEOUT, lambda p=self.proc: p and p.kill()); dog.start()
                    with tempfile.TemporaryDirectory() as d:
                        src, out = os.path.join(d, 'in.docx'), os.path.join(d, 'out.pdf')
                        with open(src, 'wb') as f: f.write(docx)
                        doc = self.desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), '_blank', 0, (prop('Hidden', True),))
                        try:
                            for _ in range(2):  # 2 passes : le sommaire peut déplacer des pages
                                idx = doc.getDocumentIndexes()
                                for i in range(idx.getCount()): idx.getByIndex(i).update()
                            doc.storeToURL(uno.systemPathToFileUrl(out), (prop('FilterName', 'writer_pdf_Export'),))
                        finally: doc.close(True)
                        with open(out, 'rb') as f: return f.read()
                except Exception:
                    self.desktop = None
                    if attempt == 2: raise
                finally:
                    if dog: dog.cancel()
        finally:
            self.lock.release()

office = Office()

hits: dict[str, deque] = defaultdict(deque)
hits_lock = threading.Lock()
def too_many(ip: str) -> bool:
    """Au plus RATE conversions par minute et par adresse."""
    now = time.monotonic()
    with hits_lock:
        q = hits[ip]
        while q and now - q[0] > 60: q.popleft()
        if len(q) >= RATE: return True
        q.append(now)
        if len(hits) > 5000:  # on ne garde pas indéfiniment toutes les adresses vues
            for k in [k for k, v in hits.items() if not v or now - v[-1] > 60]: hits.pop(k, None)
        return False

class H(BaseHTTPRequestHandler):
    timeout = 30  # une connexion qui n'envoie rien est coupée (évite de bloquer les fils d'exécution)

    def _ip(self):
        if TRUST_PROXY:
            xff = self.headers.get('X-Forwarded-For', '')
            if xff: return xff.split(',')[-1].strip()  # dernier saut = celui ajouté par notre proxy
        return self.client_address[0]
    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:  # seul le site autorisé peut appeler depuis un navigateur
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def _end(self, code):
        self.send_response(code); self._cors(); self.send_header('Content-Length', '0'); self.end_headers()
    def do_OPTIONS(self):
        self._end(204)
    def do_GET(self):
        if self.path not in ('/', '/health'): return self._end(404)
        self.send_response(200); self.send_header('Content-Length', '2'); self.end_headers(); self.wfile.write(b'ok')
    def do_POST(self):
        try: n = int(self.headers.get('Content-Length', ''))
        except ValueError: return self._end(411)
        if self.path != '/pdf': return self._end(404)
        if n > MAX: return self._end(413)
        if n <= 0: return self._end(400)
        origin = self.headers.get('Origin')
        if origin is not None and origin not in ORIGINS: return self._end(403)
        if too_many(self._ip()): return self._end(429)
        if not QUEUE.acquire(blocking=False): return self._end(503)  # trop de conversions en cours
        try:
            body = self.rfile.read(n)
            if len(body) != n or check_docx(body): return self._end(400)  # fichier incomplet ou refusé
            try: pdf = office.to_pdf(body)
            except TimeoutError: return self._end(503)
            except Exception: return self._end(500)
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/pdf'); self.send_header('Content-Length', str(len(pdf)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers(); self.wfile.write(pdf)
        finally:
            QUEUE.release()
    def log_message(self, *a): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
