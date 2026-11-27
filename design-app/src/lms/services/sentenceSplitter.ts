// Splits streamed reply text into speakable sentences as it arrives.
export class SentenceSplitter {
  private buffer = '';
  private emitted = false;

  push(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    // Get the avatar talking sooner: the first phrase may end at a comma.
    if (!this.emitted) {
      const comma = /^(.{8,}?[,،;:])\s/.exec(this.buffer);
      if (comma && !/[.!?؟\n]/.test(comma[1])) {
        out.push(comma[1].trim());
        this.buffer = this.buffer.slice(comma[0].length);
        this.emitted = true;
      }
    }
    const re = /[^.!?؟\n]*[.!?؟\n]+(\s+|$)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer)) && m[0]) {
      const end = m.index + m[0].length;
      // Only cut at a boundary followed by more text, or very long runs.
      if (end === this.buffer.length && !/\s$/.test(m[0])) break;
      const sentence = this.buffer.slice(last, end).trim();
      if (sentence.length >= 2) out.push(sentence);
      last = end;
    }
    this.buffer = this.buffer.slice(last);
    if (out.length) this.emitted = true;
    if (this.buffer.length > 220) {
      const cut = this.buffer.lastIndexOf(' ', 200);
      if (cut > 40) {
        out.push(this.buffer.slice(0, cut).trim());
        this.buffer = this.buffer.slice(cut);
      }
    }
    return out;
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest ? [rest] : [];
  }
}
