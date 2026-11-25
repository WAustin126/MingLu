import sys, zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
z = zipfile.ZipFile(sys.argv[1])
xml = z.read('word/document.xml').decode('utf-8')
root = ET.fromstring(xml)
lines = []
for p in root.iter(W + 'p'):
    line = ''.join(t.text or '' for t in p.iter(W + 't')).strip()
    if line:
        lines.append(line)
sys.stdout.write('\n'.join(lines))
