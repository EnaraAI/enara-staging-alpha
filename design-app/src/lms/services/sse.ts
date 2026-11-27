// Parses a server-sent-events stream into `data:` JSON events, across chunk
// boundaries. Comment lines (": waiting") keep the connection alive and are skipped.
export function createSseParser(onEvent: (event: any) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try {
        onEvent(JSON.parse(data));
      } catch {
        // not JSON: ignore
      }
    }
  };
}
