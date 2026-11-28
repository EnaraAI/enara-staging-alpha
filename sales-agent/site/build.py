import json, re, sys
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
app_html = squeeze(open(src+'app.html').read())
app_js = squeeze(open(src+'app.js').read())
login_html = squeeze(open(src+'login.html').read())
worker = squeeze(open(src+'worker.js').read(), drop_comments=True)
out = ('const APP_HTML = %s;\nconst APP_JS = %s;\nconst LOGIN_HTML = %s;\n' % (
    json.dumps(app_html), json.dumps(app_js), json.dumps(login_html))) + ascii_js(worker)
assert all(ord(c) < 128 for c in out)
import os
os.makedirs('out', exist_ok=True)
open('out/site.mjs','w').write(out)
print('built', len(out), 'bytes')
