import fs from 'fs';
import { MongoClient } from 'mongodb';
import { CONTENT_COLLECTIONS } from '../contentCopy/transform';
import { mongoHost, TEST_CLUSTER_HOST_PREFIX } from '../maintenance/routes';

// Import a content export into the LMS TEST database only.
//   TARGET_MONGODB_URI='mongodb+srv://...enara-lms-test....' npm run content:import -- --file content-export.json
//       -> dry run (default): prints what would be written
//   ... -- --file content-export.json --apply   -> writes (upsert by id)
//   ... -- --undo <exportId> --apply            -> removes exactly that import
// Refuses any database that is not the test cluster. Content goes to the
// fake test school (default LT-SCHOOL-A), authored by its fake teacher.

function arg(n: string) {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const uri = process.env.TARGET_MONGODB_URI;
  if (!uri) throw new Error('Set TARGET_MONGODB_URI (the LMS TEST database).');
  if (!(mongoHost(uri) ?? '').startsWith(TEST_CLUSTER_HOST_PREFIX)) throw new Error('Refused: TARGET_MONGODB_URI is not the LMS test cluster.');
  const apply = process.argv.includes('--apply');
  const school = arg('--school') ?? 'LT-SCHOOL-A';
  const undoId = arg('--undo');
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db();
    if (db.databaseName !== 'enara_staging_alpha') throw new Error('Refused: unexpected database name.');
    if (undoId) {
      for (const c of CONTENT_COLLECTIONS) {
        const n = apply ? (await db.collection(c).deleteMany({ 'contentImport.exportId': undoId })).deletedCount : await db.collection(c).countDocuments({ 'contentImport.exportId': undoId });
        console.log(`${apply ? 'removed' : 'would remove'} ${n} from ${c}`);
      }
      return;
    }
    const file = arg('--file');
    if (!file) throw new Error('--file <export.json> is required');
    const exp = JSON.parse(fs.readFileSync(file, 'utf8')) as { exportId: string; collections: Record<string, Record<string, unknown>[]> };
    const teacher = await db.collection('users').findOne({ email: 'teacher.a1@lms-test.example' }, { projection: { _id: 1 } });
    if (!teacher) throw new Error('Run the fake seed first (teacher.a1 not found).');
    const author = String(teacher._id);
    for (const c of CONTENT_COLLECTIONS) {
      const docs = exp.collections[c] ?? [];
      if (!apply) {
        console.log(`would upsert ${docs.length} into ${c}`);
        continue;
      }
      let n = 0;
      for (const d of docs) {
        const key =
          c === 'assessment_versions' ? (d.assessmentId !== undefined ? { assessmentId: d.assessmentId, version: d.version } : null)
          : c === 'tutorfaces' ? (d.courseId !== undefined ? { courseId: d.courseId, institutionId: school } : null)
          : d.id !== undefined ? { id: d.id } : null;
        if (!key) continue;
        const withOwner = c === 'tutorfaces' ? d : { ...d, institutionId: school, ...(c === 'curriculums' || c === 'assessments' || c === 'learning_objectives' || c === 'lesson_plans' ? { createdBy: author } : {}) };
        await db.collection(c).updateOne(key, { $set: { ...withOwner, institutionId: school, contentImport: { exportId: exp.exportId, at: new Date() } } }, { upsert: true });
        n += 1;
      }
      console.log(`upserted ${n} into ${c}`);
    }
    if (!apply) console.log('\nDry run: nothing written. Add --apply to write.');
    else console.log(`\nDone. To undo: npm run content:import -- --undo ${exp.exportId} --apply`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]'));
  process.exit(1);
});
