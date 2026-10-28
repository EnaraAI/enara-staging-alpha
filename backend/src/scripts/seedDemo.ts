import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { connectDB } from '../config/db';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { DEMO_INSTITUTION_ID, DEMO_USER_EMAILS, DemoRole } from '../config/demo';
import { initialsFromName } from '../utils/idGenerator';

dotenv.config();

// Unlike scripts/seed.ts, this script is safe to run against a populated
// database: it only upserts 3 fixed accounts under a dedicated DEMO-ORG
// institution and never deletes anything.

const DEMO_STUDENT_ID = 'DEMO-STU-001';

const DEMO_NAMES: Record<DemoRole, string> = {
  student: 'Demo Student',
  teacher: 'Demo Teacher',
  admin: 'Demo Admin',
};

async function upsertDemoUser(role: DemoRole, studentId?: string) {
  const email = DEMO_USER_EMAILS[role];
  // Demo accounts are only ever reachable via POST /api/auth/demo-login
  // (when DEMO_MODE_ENABLED=true), never the real password-based /login --
  // this password is random and never shared anywhere, purely to satisfy
  // the User schema's required field.
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hashed = await bcrypt.hash(randomPassword, 12);

  await User.findOneAndUpdate(
    { email },
    {
      email,
      password: hashed,
      role,
      name: DEMO_NAMES[role],
      institutionId: DEMO_INSTITUTION_ID,
      status: 'active',
      ...(studentId ? { studentId } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seedDemo() {
  await connectDB();

  await Student.findOneAndUpdate(
    { id: DEMO_STUDENT_ID },
    {
      id: DEMO_STUDENT_ID,
      institutionId: DEMO_INSTITUTION_ID,
      name: DEMO_NAMES.student,
      email: DEMO_USER_EMAILS.student,
      grade: 'Grade 10',
      avatar: initialsFromName(DEMO_NAMES.student),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await upsertDemoUser('student', DEMO_STUDENT_ID);
  await upsertDemoUser('teacher');
  await upsertDemoUser('admin');

  console.log('Demo seed complete (upserted only, no existing data touched):');
  console.log(`  institutionId: ${DEMO_INSTITUTION_ID}`);
  (Object.keys(DEMO_USER_EMAILS) as DemoRole[]).forEach((role) => {
    console.log(`  ${role}: ${DEMO_USER_EMAILS[role]}`);
  });

  process.exit(0);
}

seedDemo().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`Demo seed failed: ${message}`);
  process.exit(1);
});
