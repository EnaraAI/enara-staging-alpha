# Dataset probe (owner, 24 Nov 2026): licences at the source, formats and score scales. Prints METADATA AND COUNTS ONLY, never answer text.
import json, os, io, zipfile, subprocess, urllib.request, collections, re
out = {}
def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'research-probe'})
    with urllib.request.urlopen(req, timeout=120) as r: data = r.read()
    return data if binary else data.decode('utf-8', 'replace')
def scan(name, df):
    import pandas as pd
    cols = list(df.columns); info = {'rows': len(df), 'columns': cols, 'numeric': {}}
    for c in cols:
        s = df[c]
        if pd.api.types.is_numeric_dtype(s): info['numeric'][c] = {'min': float(s.min()), 'max': float(s.max()), 'values': sorted(map(float, s.dropna().unique()))[:15]}
        else: info.setdefault('textLike', []).append(c) if s.astype(str).str.len().mean() > 40 else info.setdefault('short', {}).update({c: s.astype(str).value_counts().head(8).to_dict()})
    out[name] = {**out.get(name, {}), **info}
import pandas as pd
# AR-AES (Hugging Face): card licence + files + columns
try:
    card = get('https://huggingface.co/datasets/Rnghazawi-NLP/AR-AES/raw/main/README.md')
    lic = re.findall(r'^license:.*$|licen[cs]e[^\n]{0,200}', card, re.I | re.M)[:5]
    files = json.loads(get('https://huggingface.co/api/datasets/Rnghazawi-NLP/AR-AES'))
    out['ar_aes'] = {'licenceLines': lic, 'gated': files.get('gated'), 'cardData_license': (files.get('cardData') or {}).get('license'), 'files': [s['rfilename'] for s in files.get('siblings', [])]}
    for f in out['ar_aes']['files']:
        if f.endswith(('.csv', '.xlsx', '.parquet', '.json', '.jsonl')):
            raw = get(f'https://huggingface.co/datasets/Rnghazawi-NLP/AR-AES/resolve/main/{f}', True)
            df = pd.read_csv(io.BytesIO(raw)) if f.endswith('.csv') else pd.read_excel(io.BytesIO(raw)) if f.endswith('.xlsx') else pd.read_parquet(io.BytesIO(raw)) if f.endswith('.parquet') else pd.read_json(io.BytesIO(raw), lines=f.endswith('jsonl'))
            scan(f'ar_aes:{f}', df)
except Exception as e: out['ar_aes_error'] = str(e)[:300]
# Zenodo record (v2 and v3)
for rec in ['18630259', '18630360']:
    try:
        meta = json.loads(get(f'https://zenodo.org/api/records/{rec}'))
        md = meta.get('metadata', {})
        out[f'zenodo_{rec}'] = {'title': md.get('title'), 'license': md.get('license'), 'version': md.get('version'), 'files': [(f['key'], f.get('size')) for f in meta.get('files', [])], 'description_licence_mentions': re.findall(r'[^.]{0,80}licen[cs]e[^.]{0,120}', md.get('description', ''), re.I)[:3]}
        for f in meta.get('files', []):
            k = f['key']
            if k.endswith(('.csv', '.xlsx')):
                raw = get(f['links']['self'], True)
                df = pd.read_csv(io.BytesIO(raw)) if k.endswith('.csv') else pd.read_excel(io.BytesIO(raw))
                scan(f'zenodo_{rec}:{k}', df)
    except Exception as e: out[f'zenodo_{rec}_error'] = str(e)[:300]
# AR-ASAG: Mendeley licence + GitHub file structure
try:
    m = get('https://data.mendeley.com/public-api/datasets/dj95jh332j')
    out['ar_asag_mendeley'] = {'licence_mentions': re.findall(r'"licen[cs]e"[^}]{0,200}', m)[:3] or re.findall(r'CC[ -]BY[^"]{0,40}', m)[:3]}
except Exception as e: out['ar_asag_mendeley_error'] = str(e)[:300]
try:
    t = get('https://raw.githubusercontent.com/leilaouahrani/AR-ASAG-Dataset/master/TXT-%20Version/Questions-%20Model%20Answers%20-%20Student%20Answers%20-%20Grade1-%20Grade2-%20%20Average%20Gold.txt')
    lines = t.splitlines(); out['ar_asag_txt'] = {'lines': len(lines), 'first_line_fields': len(lines[0].split('\t')), 'header_tokens': lines[0][:120] if not re.search(r'[؀-ۿ]', lines[0]) else '(arabic header, not printed)'}
except Exception as e: out['ar_asag_txt_error'] = str(e)[:300]
# PERSUADE (Google Drive) reachability + columns
try:
    subprocess.run('pip install -q gdown', shell=True, check=True)
    subprocess.run('gdown -q 13phHyDzIsb0MHyJr6q-B-qIa9P2tM135 -O /tmp/persuade_train', shell=True, check=True)
    p = '/tmp/persuade_train'
    if zipfile.is_zipfile(p):
        z = zipfile.ZipFile(p); names = z.namelist(); out['persuade_zip'] = names[:5]
        df = pd.read_csv(io.BytesIO(z.read([n for n in names if n.endswith('.csv')][0])), low_memory=False)
    else: df = pd.read_csv(p, low_memory=False)
    scan('persuade_train', df.drop_duplicates(subset=[c for c in df.columns if 'essay_id' in c][:1] or None))
except Exception as e: out['persuade_error'] = str(e)[:300]
# ASAP 2.0 columns
try:
    raw = get('https://raw.githubusercontent.com/scrosseye/ASAP_2.0/main/ASAP_2_Final_github_train.zip', True)
    z = zipfile.ZipFile(io.BytesIO(raw)); df = pd.read_csv(io.BytesIO(z.read([n for n in z.namelist() if n.endswith('.csv')][0])))
    scan('asap2_train', df)
except Exception as e: out['asap2_error'] = str(e)[:300]
os.makedirs('out', exist_ok=True); json.dump(out, open('out/probe.json', 'w'), ensure_ascii=False, indent=1, default=str)
print(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != 'short'}) for k, v in out.items()}, ensure_ascii=False, default=str)[:6000])
