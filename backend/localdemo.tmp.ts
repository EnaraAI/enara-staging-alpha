// Local, throwaway copy of the platform for screenshots: in-memory database,
// the new server code, the demo template built in. No provider keys.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

(async () => {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'development', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'local-demo-secret-32-characters-minimum!', JWT_EXPIRES_IN: '4h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'local-hmac-secret-32-characters-minimum!!',
    CORS_ALLOWED_ORIGINS: 'http://localhost:4175', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'x', AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'local', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', PORT: '5055',
  });
  const { resetConfigForTests } = await import('./src/config/env');
  resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const { createApp } = await import('./src/app');
  const { buildDemoTemplate } = await import('./src/services/demoTemplate');
  console.log(JSON.stringify(await buildDemoTemplate()));
  const { User } = await import('./src/models/User');
  const { signAccessToken } = await import('./src/auth/jwt');
  const ops = await User.create({ email: 'ops@local.test', password: 'x', role: 'enara-admin', name: 'Local Ops' });
  (await import('fs')).writeFileSync('/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/secret/.local_ops_token', signAccessToken({ id: ops._id.toString(), email: ops.email, role: 'enara-admin' } as never), { mode: 0o600 });
  createApp().listen(5055, () => console.log('local api on 5055'));
})().catch((e) => { console.error(e); process.exit(1); });
