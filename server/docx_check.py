"""Contrôle d'un .docx reçu AVANT de le donner à LibreOffice (le serveur PDF est public).

mondocpro fabrique des .docx très simples : texte, tableaux, une image PNG/JPG, des champs de sommaire.
Tout le reste (liens vers l'extérieur, champs qui lisent un fichier, objets OLE, macros, archives
« bombes ») est refusé : cela évite qu'on se serve du serveur pour lire ses fichiers ou appeler son réseau interne.
"""
import io
import re
import zipfile

MAX_ENTRIES = 300
MAX_UNCOMPRESSED = 60 * 1024 * 1024  # octets, tout le contenu décompressé
MAX_PART = 30 * 1024 * 1024
MAX_RATIO = 200  # une partie 200 fois plus grosse décompressée que compressée = bombe probable

# champs Word qui vont chercher un fichier, une URL ou lancent une commande (on regarde le NOM du champ,
# pas le texte du mémoire : un mot comme « import » dans un paragraphe ne doit jamais bloquer le PDF)
BAD_FIELD_NAMES = {'INCLUDETEXT', 'INCLUDEPICTURE', 'INCLUDE', 'DDE', 'DDEAUTO', 'LINK', 'AUTOTEXT', 'IMPORT', 'DATABASE', 'MACROBUTTON'}
INSTR = re.compile(rb'<w:instrText\b[^>]*>(.*?)</w:instrText>|<w:fldSimple\b[^>]*\bw:instr="([^"]*)"', re.I | re.S)
EXTERNAL_TARGET = re.compile(rb'(?:[a-z][a-z0-9+.-]*:)?//|file:|\\\\', re.I)
BAD_XML = re.compile(rb'<w:altChunk\b|<w:object\b|<o:OLEObject\b|<w:subDoc\b|<!ENTITY|<!DOCTYPE', re.I)
EXTERNAL_REL = re.compile(rb'<Relationship\b[^>]*TargetMode="External"[^>]*>', re.I)
BAD_NAME = re.compile(r'(^|/)(vbaProject\.bin|embeddings/|activeX/|oleObject)', re.I)
XML_PARTS = re.compile(r'\.(xml|rels)$', re.I)


def check_docx(body: bytes) -> str | None:
    """Renvoie None si le fichier est acceptable, sinon une courte raison (jamais montrée telle quelle à l'utilisateur)."""
    if body[:2] != b'PK':
        return 'pas une archive'
    try:
        z = zipfile.ZipFile(io.BytesIO(body))
        infos = z.infolist()
    except zipfile.BadZipFile:
        return 'archive illisible'
    if len(infos) > MAX_ENTRIES:
        return 'trop de fichiers'
    if sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
        return 'trop volumineux une fois décompressé'
    names = {i.filename for i in infos}
    if 'word/document.xml' not in names or '[Content_Types].xml' not in names:
        return 'pas un document Word'
    for i in infos:
        n = i.filename
        if n.startswith('/') or '..' in n.split('/') or '\\' in n:
            return 'chemin suspect'
        if BAD_NAME.search(n):
            return 'contenu actif ou incorporé'
        if i.file_size > MAX_PART or (i.compress_size and i.file_size / i.compress_size > MAX_RATIO and i.file_size > 1024 * 1024):
            return 'archive piégée'
        if XML_PARTS.search(n):
            data = z.read(i)
            if BAD_XML.search(data):
                return 'élément interdit'
            if n.startswith('word/'):
                for m in INSTR.finditer(data):
                    instr = (m.group(1) or m.group(2) or b'').strip()
                    name = instr.split(None, 1)[0].upper().decode('latin-1') if instr else ''
                    if name in BAD_FIELD_NAMES or (name == 'HYPERLINK' and EXTERNAL_TARGET.search(instr)):
                        return 'champ interdit'
            if n.endswith('.rels') and EXTERNAL_REL.search(data):
                return 'lien externe'
    return None
