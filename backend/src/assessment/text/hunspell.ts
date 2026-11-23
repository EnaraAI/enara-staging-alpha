// A small Hunspell-compatible word checker (our own code; reads unmodified Hunspell .aff/.dic files). Pure: it takes the file texts.
// Why not nspell: nspell does not apply a prefix that a suffix's continuation class allows, which is how Ayaspell (ar.aff) adds
// the article and the attached prepositions (ال، بال، وال، لل …), so it rejects "المدرسة". This checker covers the parts of the
// format both shipped dictionaries use:
//   - FLAG (char, long, num), AF aliases (flags given by number), SET UTF-8, IGNORE (Arabic tashkeel), ICONV;
//   - PFX / SFX with strip, append, condition and continuation classes; cross product; a second (outer) suffix allowed by the
//     first suffix's continuation class (twofold suffixes); a prefix allowed by a suffix's continuation class or by cross product;
//   - ONLYINCOMPOUND / NEEDAFFIX words are not accepted alone; FORBIDDENWORD words are refused;
//   - case: "House" and "HOUSE" are accepted when "house" is; a word the dictionary has only capitalised ("Cairo", "I") written in
//     lower case is reported as a case problem, not a spelling one.
// Compounding (en_US: ordinals such as 21st) and suggestions are not implemented: callers skip numbers and never need suggestions.
// The checker is lenient where the format is ambiguous: when in doubt it accepts a word (a missed misspelling is safe; a false one is not).

interface Affix { flag: string; strip: string; add: string; cond: RegExp | null; cont: Set<string> | null; contRaw: string; cross: boolean }

export type WordStatus = 'ok' | 'case' | 'bad';

export class Hunspell {
  private flagMode: 'char' | 'long' | 'num' = 'char';
  private aliases: string[] = [];
  private aliasSets: (Set<string> | undefined)[] = [];
  private ignore: RegExp | null = null;
  private iconv: [string, string][] = [];
  private pfx = new Map<string, Affix[]>();
  private sfx = new Map<string, Affix[]>();
  private maxPfx = 0;
  private maxSfx = 0;
  private words = new Map<string, string>(); // word → raw flag field(s), homonyms joined by '\u0001'
  private noAlone = new Set<string>(); // ONLYINCOMPOUND, NEEDAFFIX
  private forbidden: string | null = null;
  private flagCache = new Map<string, Set<string>>();

  constructor(aff: string, dic: string) {
    this.parseAff(aff);
    this.parseDic(dic);
  }

  /** Number of dictionary entries (stems), for load reports. */
  get size(): number { return this.words.size; }

  private splitFlags(s: string): string[] {
    if (!s) return [];
    if (this.flagMode === 'long') return s.match(/[\s\S]{1,2}/g) ?? [];
    if (this.flagMode === 'num') return s.split(',').map((x) => x.trim()).filter(Boolean);
    return [...s];
  }
  /** A raw flag field (a flag string, or an AF alias number) as a set. */
  private flagsOf(raw: string): Set<string> {
    if (this.aliases.length && /^\d+$/.test(raw)) {
      const n = Number(raw);
      return (this.aliasSets[n] ??= new Set(this.splitFlags(this.aliases[n] ?? '')));
    }
    let s = this.flagCache.get(raw);
    if (!s) { s = new Set(this.splitFlags(raw)); if (this.flagCache.size < 50_000) this.flagCache.set(raw, s); }
    return s;
  }
  private clean(s: string): string {
    let t = s.normalize('NFC');
    for (const [a, b] of this.iconv) if (t.includes(a)) t = t.split(a).join(b);
    return this.ignore ? t.replace(this.ignore, '') : t;
  }

  private parseAff(aff: string): void {
    const lines = aff.split(/\r?\n/);
    const heads = new Map<string, boolean>(); // affix flag → cross product
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      switch (f[0]) {
        case 'FLAG': this.flagMode = f[1] === 'long' ? 'long' : f[1] === 'num' ? 'num' : 'char'; break;
        case 'AF': if (!this.aliases.length && /^\d+$/.test(f[1] ?? '')) this.aliases = ['']; else if (f[1]) this.aliases.push(f[1]); break; // AF <count>, then AF <flags> (alias 1, 2, …)
        case 'IGNORE': if (f[1]) this.ignore = new RegExp(`[${f[1].replace(/[\]\\^-]/g, '\\$&')}]`, 'gu'); break;
        case 'ICONV': if (f.length >= 3) this.iconv.push([f[1], f[2]]); break;
        case 'ONLYINCOMPOUND': case 'NEEDAFFIX': if (f[1]) this.noAlone.add(f[1]); break;
        case 'FORBIDDENWORD': if (f[1]) this.forbidden = f[1]; break;
        case 'PFX': case 'SFX': {
          if (f.length === 4 && /^[YN]$/.test(f[2]) && /^\d+$/.test(f[3])) { heads.set(`${f[0]}${f[1]}`, f[2] === 'Y'); break; }
          if (f.length < 5) break;
          const [kind, flag, strip, addRaw, cond] = f;
          const slash = addRaw.indexOf('/');
          const addPart = slash >= 0 ? addRaw.slice(0, slash) : addRaw;
          const contRaw = slash >= 0 ? addRaw.slice(slash + 1) : '';
          const a: Affix = {
            flag, strip: strip === '0' ? '' : strip, add: addPart === '0' ? '' : addPart, cross: heads.get(`${kind}${flag}`) ?? false,
            cond: cond === '.' ? null : new RegExp(kind === 'PFX' ? `^(?:${cond})` : `(?:${cond})$`, 'u'),
            cont: null, contRaw,
          };
          (kind === 'PFX' ? this.pfxList : this.sfxList).push(a);
          break;
        }
        default: break;
      }
    }
    // Continuation classes and IGNORE need the whole file read first (AF and IGNORE may come after the affixes).
    for (const [list, map, isPfx] of [[this.pfxList, this.pfx, true], [this.sfxList, this.sfx, false]] as const) {
      for (const a of list) {
        a.cont = a.contRaw ? this.flagsOf(a.contRaw) : null;
        a.strip = this.clean(a.strip); a.add = this.clean(a.add);
        const k = a.add;
        const arr = map.get(k); if (arr) arr.push(a); else map.set(k, [a]);
        if (isPfx) this.maxPfx = Math.max(this.maxPfx, k.length); else this.maxSfx = Math.max(this.maxSfx, k.length);
      }
    }
    this.pfxList = []; this.sfxList = [];
  }
  private pfxList: Affix[] = [];
  private sfxList: Affix[] = [];

  private parseDic(dic: string): void {
    const lines = dic.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const tab = line.indexOf('\t');
      const entry = tab >= 0 ? line.slice(0, tab) : line;
      const slash = entry.indexOf('/');
      const word = this.clean((slash >= 0 ? entry.slice(0, slash) : entry).trim());
      if (!word) continue;
      const flags = slash >= 0 ? entry.slice(slash + 1).trim() : '';
      const prev = this.words.get(word);
      this.words.set(word, prev === undefined ? flags : `${prev}\u0001${flags}`);
    }
  }

  private homonyms(word: string): Set<string>[] {
    const raw = this.words.get(word);
    if (raw === undefined) return [];
    return raw.split('\u0001').map((r) => this.flagsOf(r));
  }
  private standsAlone(word: string): boolean {
    return this.homonyms(word).some((fl) => ![...this.noAlone].some((x) => fl.has(x)) && !(this.forbidden && fl.has(this.forbidden)));
  }

  /** word = root + s (+ outer), with an optional prefix p in front. */
  private suffixed(word: string, p: Affix | null, outer: Affix | null): boolean {
    for (let n = Math.min(this.maxSfx, word.length - 1); n >= 0; n--) {
      const list = this.sfx.get(n ? word.slice(-n) : '');
      if (!list) continue;
      for (const s of list) {
        if (outer && !s.cont?.has(outer.flag)) continue;
        const stem = word.slice(0, word.length - n) + s.strip;
        if (!stem || s.cond && !s.cond.test(stem)) continue;
        for (const fl of this.homonyms(stem)) {
          if (!fl.has(s.flag) || this.forbidden && fl.has(this.forbidden)) continue;
          if (!p) return true;
          if ((p.cross && s.cross && fl.has(p.flag)) || s.cont?.has(p.flag) || outer?.cont?.has(p.flag)) return true;
        }
        if (!outer && this.suffixed(stem, p, s)) return true;
      }
    }
    return false;
  }

  private known(word: string): boolean {
    if (this.standsAlone(word)) return true;
    if (this.suffixed(word, null, null)) return true;
    for (let n = Math.min(this.maxPfx, word.length - 1); n >= 1; n--) {
      const list = this.pfx.get(word.slice(0, n));
      if (!list) continue;
      for (const p of list) {
        const stem = p.strip + word.slice(n);
        if (p.cond && !p.cond.test(stem)) continue;
        if (this.homonyms(stem).some((fl) => fl.has(p.flag))) return true;
        if (this.suffixed(stem, p, null)) return true;
      }
    }
    return false;
  }

  /** Is the word spelled right? 'case' = right letters, wrong capitals (a name or "I" written in lower case). */
  check(raw: string): WordStatus {
    const w = this.clean(raw);
    if (!w) return 'ok';
    if (this.known(w)) return 'ok';
    const lower = w.toLowerCase();
    const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
    if (w !== lower) {
      // Capitalised or all capitals: accept when the lower-case (or, for all capitals, the capitalised) form is a word.
      if (w === cap || w === w.toUpperCase()) { if (this.known(lower) || this.known(cap)) return 'ok'; }
      else if (this.known(lower)) return 'ok';
    } else if (cap !== w && this.known(cap)) return 'case';
    else if (w.toUpperCase() !== w && this.known(w.toUpperCase())) return 'case';
    return 'bad';
  }
}
