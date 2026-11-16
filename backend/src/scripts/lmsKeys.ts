import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { createNextKey, ensureActiveKey, getPublicJwks, promoteNextKey } from '../integrations/lms/core/keys';

// LMS signing keys (needs MONGODB_URI and LMS_KEK in the environment).
//   npm run lms:keys -- ensure    create the first active key if none exists
//   npm run lms:keys -- next      publish a `next` key (rotation step 1)
//   npm run lms:keys -- promote   next -> active, active -> retired (step 2;
//                                 wait at least a day after step 1 so platforms
//                                 have refreshed their JWKS cache)
//   npm run lms:keys -- list      print the public kids and their status
// Prints key ids only, never key material.
async function main() {
  const cmd = process.argv[2];
  await openMongo();
  if (cmd === 'ensure') console.log(`active kid: ${await ensureActiveKey()}`);
  else if (cmd === 'next') console.log(`next kid: ${await createNextKey()}`);
  else if (cmd === 'promote') console.log(`active kid: ${await promoteNextKey()}`);
  else if (cmd === 'list') console.log((await getPublicJwks()).keys.map((k) => k.kid).join('\n') || 'No published keys.');
  else throw new Error('Usage: lms:keys -- ensure | next | promote | list');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
