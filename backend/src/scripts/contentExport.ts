import fs from 'fs';
import { MongoClient } from 'mongodb';
import { buildPeopleIndex, CONTENT_COLLECTIONS, fileRefs, scanDoc, shapeFor, stripDoc, type Hit } from '../contentCopy/transform';

// Export learning content from the REAL database, with no personal data.
// Run on a trusted computer (docs/lms/CONTENT_COPY.md), with a READ-ONLY user:
//   SOURCE_MONGODB_URI='mongodb+srv://READONLY_USER:...@.../enara_staging_alpha' npm run content:export
//       -> dry run (default): prints counts and held-back records, writes NOTHING
//   ... npm run content:export -- --write content-export.json
//       -> also writes the export file (content only)
// The connection string is read from the environment and never printed.
// Real names and emails are loaded into memory only to detect them; they are
// never written to the report or the export file.

async function main() {
  const uri = process.env.SOURCE_MONGODB_URI;
  if (!uri) throw new Error('Set SOURCE_MONGODB_URI (a read-only user on the real database).');
  const outIdx = process.argv.indexOf('--write');
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  if (outIdx >= 0 && !outFile) throw new Error('--write needs a file name');

  const client = await MongoClient.connect(uri, { readPreference: 'secondaryPreferred' });
  try {
    const db = client.db();
    const people = buildPeopleIndex([
      ...(await db.collection('users').find({}, { projection: { name: 1, email: 1 } }).toArray()),
      ...(await db.collection('students').find({}, { projection: { name: 1, email: 1 } }).toArray()),
    ] as { name?: string; email?: string }[]);

    const data: Record<string, Record<string, unknown>[]> = {};
    const held: { collection: string; id: string; hits: Hit[] }[] = [];
    const counts: Record<string, { found: number; exported: number; held: number; skipped: number }> = {};
    for (const name of CONTENT_COLLECTIONS) {
      const docs = await db.collection(name).find({}).toArray();
      const out: Record<string, unknown>[] = [];
      let skipped = 0;
      docs.forEach((raw, i) => {
        const shaped = shapeFor(name, stripDoc(raw) as Record<string, unknown>, i);
        if (!shaped) {
          skipped += 1;
          return;
        }
        const hits = scanDoc(shaped, people);
        if (hits.length) held.push({ collection: name, id: String(shaped.id ?? shaped.assessmentId ?? `#${i}`), hits });
        else out.push(shaped);
      });
      data[name] = out;
      counts[name] = { found: docs.length, exported: out.length, held: docs.length - skipped - out.length, skipped };
    }
    const report = {
      mode: outFile ? 'export' : 'dry-run',
      database: db.databaseName,
      peopleIndexed: { names: people.names.length, emails: people.emails.size },
      counts,
      heldBack: held, // ids + field paths + kind only; the matched text is never shown
      filesReferenced: fileRefs((data.curriculums ?? []) as Record<string, unknown>[]),
    };
    console.log(JSON.stringify(report, null, 2));
    if (outFile) {
      fs.writeFileSync(outFile, JSON.stringify({ exportId: `exp-${Date.now()}`, createdAt: new Date().toISOString(), collections: data }));
      console.log(`\nExport written: ${outFile} (content only, no personal data). Held-back records are NOT in it.`);
    } else {
      console.log('\nDry run: nothing written. Add --write <file> to write the export.');
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]'));
  process.exit(1);
});
