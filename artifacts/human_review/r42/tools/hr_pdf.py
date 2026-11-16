import markdown, sys, os, html
OUT='/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha/artifacts/human_review/r42'
CSS='''body{font-family:"DejaVu Sans","FreeSerif",sans-serif;font-size:10.5pt;line-height:1.45;color:#111;margin:0}
h1{font-size:18pt;border-bottom:2px solid #333;padding-bottom:4px}h2{font-size:14pt;margin-top:22px;border-bottom:1px solid #aaa;page-break-after:avoid}h3{font-size:12pt;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9pt;page-break-inside:auto}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}th{background:#e8eef5}
tr{page-break-inside:avoid}blockquote{margin:6px 0 10px 0;padding:6px 10px;border-left:4px solid #4a7ab5;background:#f4f7fb;unicode-bidi:plaintext}
code{font-family:"DejaVu Sans Mono",monospace;font-size:9pt;background:#f2f2f2;padding:0 2px}hr{border:0;border-top:1px dashed #bbb;margin:18px 0}p{unicode-bidi:plaintext}'''
for name in sys.argv[1:]:
    src=f'{OUT}/{name}.md'
    import re
    lines=open(src,encoding='utf-8').read().split('\n'); fixed=[]
    for ln in lines:
        is_item=bool(re.match(r'\s*([-*]|\d+\.)\s',ln))
        if is_item and fixed and fixed[-1].strip() and not re.match(r'\s*([-*]|\d+\.)\s',fixed[-1]) and not fixed[-1].lstrip().startswith(('|','>')):
            fixed.append('')
        fixed.append(ln)
    body=markdown.markdown('\n'.join(fixed),extensions=['tables','fenced_code','sane_lists'])
    open(f'{OUT}/.{name}.html','w',encoding='utf-8').write(f'<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(name)}</title><style>{CSS}</style></head><body>{body}</body></html>')
