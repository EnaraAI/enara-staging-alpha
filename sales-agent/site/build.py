import json, os, re
# Inlines src/ into one Worker module (out/site.mjs): the pages, the app script, the ENARA mark and the
# chat's claims rules (taken from agent/PROMPT.md so the chat and the agent always follow the same rules).
src = 'src/'
def ascii_js(s):
    return ''.join(c if ord(c) < 128 else '\\u%04x' % ord(c) for c in s)
def squeeze(s, drop_comments=False):
    lines = []
    for ln in s.split('\n'):
        t = ln.strip()
        if not t: continue
        if drop_comments and t.startswith('//'): continue
        lines.append(t)
    return '\n'.join(lines)
def read(p):
    return open(src + p, encoding='utf-8').read()

# The ENARA mark: one path, shown as an SVG <symbol> in the pages and served as /favicon.svg.
mark_svg = read('enara-mark.svg').strip()
mark_path = re.search(r'<path fill-rule="evenodd" d="([^"]+)"', mark_svg).group(1)
symbol = ('<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="enara-mark" viewBox="0 0 980 994">'
          '<path fill="currentColor" fill-rule="evenodd" d="%s"/></symbol></svg>' % mark_path)
def page(p):
    return squeeze(read(p)).replace('<!--ENARA_MARK-->', symbol)

# The app script: files in src/app/ in this order, inside one block so nothing leaks to window.
APP_PARTS = ['core.js', 'review.js', 'lead.js', 'pipeline.js', 'insights.js', 'chat.js', 'settings.js', 'start.js']
app_js = '{\n' + '\n'.join(squeeze(read('app/' + p)) for p in APP_PARTS) + '\n}'

# Chat rules: the claims, "never say", opt-out and signature sections of the agent prompt.
prompt = open('../agent/PROMPT.md', encoding='utf-8').read()
def section(title):
    m = re.search(r'^## ' + re.escape(title) + r'\n(.*?)(?=^## |\Z)', prompt, re.S | re.M)
    assert m, 'PROMPT.md section missing: ' + title
    return '## ' + title + '\n' + m.group(1).strip()
claims = '\n\n'.join(section(t) for t in ['Writing a first draft (status "drafted", step 1)', 'What you may say about ENARA', 'Never say'])

WORKER_PARTS = ['worker.js', 'crm.js', 'insights.js', 'chat.js']  # worker.js first: chat.js uses its constants at load
worker = '\n'.join(squeeze(read(p), drop_comments=True) for p in WORKER_PARTS)
out = ('const APP_HTML = %s;\nconst APP_JS = %s;\nconst LOGIN_HTML = %s;\nconst FAVICON_SVG = %s;\nconst CHAT_CLAIMS = %s;\n' % (
    json.dumps(page('app.html')), json.dumps(app_js), json.dumps(page('login.html')), json.dumps(mark_svg), json.dumps(claims))) + ascii_js(worker)
assert all(ord(c) < 128 for c in out)
os.makedirs('out', exist_ok=True)
open('out/site.mjs', 'w').write(out)
print('built', len(out), 'bytes')
