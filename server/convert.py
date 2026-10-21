"""Convertit un .docx en PDF avec LibreOffice (mise à jour du sommaire incluse).
POST /pdf  (corps = fichier .docx)  ->  application/pdf
Variables : PORT (8787), ALLOW_ORIGIN (*), MAX_MB (8)"""
import os, subprocess, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import uno
from com.sun.star.beans import PropertyValue

PORT = int(os.environ.get('PORT', 8787))
ORIGIN = os.environ.get('ALLOW_ORIGIN', '*')
MAX = int(os.environ.get('MAX_MB', 8)) * 1024 * 1024
LO_PORT = 2002

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
        with self.lock:
            for attempt in (1, 2):
                try:
                    if not self.desktop: self.start()
                    with tempfile.TemporaryDirectory() as d:
                        src, out = os.path.join(d, 'in.docx'), os.path.join(d, 'out.pdf')
                        open(src, 'wb').write(docx)
                        doc = self.desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), '_blank', 0, (prop('Hidden', True),))
                        try:
                            for _ in range(2):  # 2 passes : le sommaire peut déplacer des pages
                                idx = doc.getDocumentIndexes()
                                for i in range(idx.getCount()): idx.getByIndex(i).update()
                            doc.storeToURL(uno.systemPathToFileUrl(out), (prop('FilterName', 'writer_pdf_Export'),))
                        finally: doc.close(True)
                        return open(out, 'rb').read()
                except Exception:
                    self.desktop = None
                    if attempt == 2: raise

office = Office()

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        if self.path != '/pdf' or not 0 < n <= MAX:
            self.send_response(413 if n > MAX else 404); self._cors(); self.end_headers(); return
        body = self.rfile.read(n)
        if body[:2] != b'PK':  # un .docx est une archive zip
            self.send_response(400); self._cors(); self.end_headers(); return
        try: pdf = office.to_pdf(body)
        except Exception:
            self.send_response(500); self._cors(); self.end_headers(); return
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'application/pdf'); self.send_header('Content-Length', str(len(pdf)))
        self.end_headers(); self.wfile.write(pdf)
    def log_message(self, *a): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
