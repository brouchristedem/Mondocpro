"""python3 server/test_docx_check.py : vérifie le contrôle des .docx du serveur PDF."""
import io
import zipfile

from docx_check import check_docx

CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def make(document: str, extra: dict[str, str] | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CT)
        z.writestr('word/document.xml', f'<w:document {W}><w:body>{document}</w:body></w:document>')
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


def p(text: str) -> str:
    return f'<w:p><w:r><w:t>{text}</w:t></w:r></w:p>'


def field(instr: str) -> str:
    return f'<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> {instr} </w:instrText></w:r></w:p>'


# ce que fabrique mondocpro : accepté (y compris des mots comme « import », « link », « include » dans le texte)
ok = make(p('Import et export : link, include, DDE, INCLUDETEXT dans un paragraphe normal') + field('TOC \\o "1-3" \\h \\z \\u') + field('PAGEREF _Toc100000 \\h') + field('SEQ Tableau \\* ARABIC'))
assert check_docx(ok) is None, check_docx(ok)

# refusés
assert check_docx(b'%PDF-1.4') == 'pas une archive'
assert check_docx(b'PK\x03\x04pasunzip') == 'archive illisible'
assert check_docx(make(field('INCLUDETEXT "file:///etc/passwd"'))) == 'champ interdit'
assert check_docx(make(field('includepicture "http://169.254.169.254/x.png"'))) == 'champ interdit'
assert check_docx(make(field('DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k calc"'))) == 'champ interdit'
assert check_docx(make(field('HYPERLINK "http://exemple.ci"'))) == 'champ interdit'
assert check_docx(make(field('HYPERLINK \\l "_Toc100000"'))) is None  # lien interne autorisé
assert check_docx(make(p('x'), {'word/_rels/document.xml.rels': '<Relationships><Relationship Id="r1" Type="x" Target="http://a.b/c.png" TargetMode="External"/></Relationships>'})) == 'lien externe'
assert check_docx(make(p('x'), {'word/embeddings/o.bin': 'x'})) == 'contenu actif ou incorporé'
assert check_docx(make(p('x'), {'word/vbaProject.bin': 'x'})) == 'contenu actif ou incorporé'
assert check_docx(make('<w:altChunk r:id="x"/>')) == 'élément interdit'
assert check_docx(make(p('x'), {'word/styles.xml': '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a/>'})) == 'élément interdit'
assert check_docx(make(p('x'), {'../evil.xml': '<a/>'})) == 'chemin suspect'
# bombe : 40 Mo de zéros compressés en quelques Ko
assert check_docx(make(p('x'), {'word/media/b.bin': '0' * (40 * 1024 * 1024)})) in ('archive piégée', 'trop volumineux une fois décompressé')
# un zip valide mais pas Word
buf = io.BytesIO(); zipfile.ZipFile(buf, 'w').writestr('a.txt', 'x')
assert check_docx(buf.getvalue()) == 'pas un document Word'
print('contrôle docx : OK')
