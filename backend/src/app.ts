import { createDownloadUrl, isRemoteUploadStorage, readUpload } from './services/uploadStorage';
import { isVideoFileName } from './utils/uploadSecurity';
import express, { NextFunction, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { idleDbController, mountStagingFrontend } from './config/stagingSingleService';
import { dbAvailabilityGate } from './config/dbAvailability';
import { requestDeadline } from './middleware/requestDeadline';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import { verifyAccessToken } from './auth/jwt';
import path from 'path';
import { getConfig } from './config/env';
import { setupSwagger } from './config/swagger';
import { errorHandler, AppError } from './middleware/errorHandler';
import { isValidUploadSignature, uploadLinkSigning } from './utils/uploadSigning';
import { resolveUpload } from './services/uploadAccess';
import { MongoRateLimitStore } from './services/mongoRateLimitStore';
import { captureRawBody, requestContext, requestLogger } from './middleware/requestContext';
import authRoutes from './routes/auth.routes';
import curriculumRoutes from './routes/curriculum.routes';
import avatarRoutes from './routes/avatar.routes';
import cronRoutes from './routes/cron.routes';
import tutorFacesRoutes from './routes/tutorFaces.routes';
import batchRoutes from './routes/batch.routes';
import courseInstanceRoutes from './routes/courseInstance.routes';
import studentRoutes from './routes/student.routes';
import meRoutes from './routes/me.routes';
import assessmentRoutes from './routes/assessment.routes';
import ingestionRoutes from './routes/ingestion.routes';
import integrationsRoutes from './routes/integrations.routes';
import securityRoutes from './routes/security.routes';
import analyticsRoutes from './routes/analytics.routes';
import uploadRoutes from './routes/upload.routes';
import teacherAttendanceRoutes from './routes/teacherAttendance.routes';
import creditsRoutes from './routes/credits.routes';
import learningRoutes from './routes/learning.routes';
import assignmentsRoutes from './routes/assignments.routes';
import gradingRoutes from './routes/grading.routes';
import teachingRoutes from './routes/teaching.routes';
import lessonPlansRoutes from './routes/lessonPlans.routes';
import aiControlsRoutes from './routes/aiControls.routes';
import workspaceRoutes from './routes/workspace.routes';
import documentsRoutes from './routes/documents.routes';
import educatorChatRoutes from './routes/educatorChat.routes';
import speakingRoutes from './routes/speaking.routes';
import usageRoutes from './routes/usage.routes';
import { getPostgresPool } from './config/postgres';
import mongoose from 'mongoose';

function corsOptions(): CorsOptions {
  const config = getConfig();
  return {
    // Auth uses Bearer tokens, not cookies, so browsers never send credentials.
    credentials: false,
    // Read by the live call to know the reply carries its own speech.
    exposedHeaders: ['X-Enara-Speech'],
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.corsAllowedOrigins.includes(origin));
    },
  };
}

// The verified user behind a request, or undefined: a forged or expired token
// never gets its own rate-limit bucket (it falls back to the IP address).
function verifiedUserKey(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return undefined;
  try {
    return `uid:${verifyAccessToken(h.slice(7)).subject}`;
  } catch {
    return undefined;
  }
}

function makeLimiter(name: string, windowMs: number, max: number, message: string, perUser: boolean | 'verified' = false, skip?: (req: Request) => boolean) {
  return rateLimit({
    windowMs,
    max,
    ...(skip ? { skip } : {}),
    store: new MongoRateLimitStore(name),
    // Don't take the API down if the counter store fails.
    passOnStoreError: true,
    // Per signed-in user where a school's students share one IP address.
    ...(perUser === 'verified'
      ? { keyGenerator: (req: Request) => verifiedUserKey(req) ?? req.ip ?? 'unknown' }
      : perUser
      ? {
          keyGenerator: (req: Request) =>
            req.headers.authorization
              ? `user:${createHash('sha256').update(req.headers.authorization).digest('hex')}`
              : req.ip || 'unknown',
        }
      : {}),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message,
      },
      message,
    },
  });
}

export function createApp() {
  const config = getConfig();
  const app = express();

  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext);
  app.use(dbAvailabilityGate);
  app.use(requestDeadline(config.requestDeadlineMs));
  if (config.dbIdleDisconnectMs) {
    app.use(idleDbController(config.dbIdleDisconnectMs).middleware);
  }
  if (!config.isTest) {
    app.use(requestLogger);
  }
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors(corsOptions()));

  app.use('/api/auth/login', makeLimiter('login', 15 * 60 * 1000, 20, 'Too many login attempts'));
  app.use('/api/auth/register', makeLimiter('register', 60 * 60 * 1000, 10, 'Too many registration attempts'));
  app.use('/api/auth/demo-login', makeLimiter('demo-login', 60 * 1000, 10, 'Too many demo login attempts'));
  app.use('/api/auth/password-reset', makeLimiter('password-reset', 15 * 60 * 1000, 10, 'Too many password reset requests'));
  app.use('/api/workspace/invitations/accept', makeLimiter('invitation-accept', 15 * 60 * 1000, 20, 'Too many invitation attempts'));
  app.use('/api/upload', makeLimiter('upload', 60 * 60 * 1000, 30, 'Too many upload requests'));
  app.post('/api/documents', makeLimiter('documents', 60 * 60 * 1000, 60, 'Too many document uploads', true));
  app.post('/api/educator-chat/ask', makeLimiter('educator-chat', 60 * 1000, 20, 'Too many AI requests', true));
  app.use('/api/ingestion', makeLimiter('ingestion', 60 * 1000, 120, 'Too many ingestion requests'));
  // Abuse cap per IP (a class shares one); per user and per school in me.routes.ts.
  app.use('/api/me/tutor', makeLimiter('me-tutor', 60 * 1000, 600, 'Too many AI requests'));
  app.post('/api/me/events', makeLimiter('me-events', 60 * 1000, 30, 'Too many events', true));
  // Educator AI drafts: per user, an hour at a time.
  app.post('/api/assessments/generate', makeLimiter('ai-assessment', 60 * 60 * 1000, 20, 'Too many AI drafts', true));
  app.post('/api/assessments/:id/questions/:questionId/regenerate', makeLimiter('ai-question', 60 * 60 * 1000, 60, 'Too many AI requests', true));
  app.post('/api/lesson-plans/generate', makeLimiter('ai-lesson', 60 * 60 * 1000, 20, 'Too many AI drafts', true));
  app.post('/api/lesson-plans/:id/sections/:sectionId/regenerate', makeLimiter('ai-lesson-section', 60 * 60 * 1000, 60, 'Too many AI requests', true));
  app.post('/api/learning/objectives/extract', makeLimiter('objective-extract', 60 * 60 * 1000, 10, 'Too many extraction requests', true));
  // Exact path: starting a call. Transcription tokens are fetched once per sentence.
  app.post('/api/avatar/session', makeLimiter('avatar-session', 60 * 1000, 10, 'Too many live tutor sessions', true));
  app.use('/api/avatar/session/:id/stt-token', makeLimiter('stt-token', 60 * 1000, 60, 'Too many transcription requests', true));
  app.use('/api/avatar/query-stream', makeLimiter('avatar-query', 60 * 1000, 30, 'Too many AI requests', true));
  app.use('/api/avatar/speak', makeLimiter('speak', 60 * 1000, 120, 'Too many speech requests', true));
  // /api/learning is limited per verified user instead (learning.routes.ts):
  // a class doing diagnostics shares the school's IP address.
  // P19-1: 300/min per verified user (a class behind one school IP no longer
  // shares one budget); unauthenticated or invalid-token traffic stays per IP.
  // A coarse per-IP ceiling still bounds everything coming from one address.
  const learningOwnLimiter = (req: Request) => req.path.startsWith('/learning/') && req.path !== '/learning/objectives/extract';
  // Live-call routes said many times per minute have their own per-user
  // limits above; skipping the general per-user one saves a database round
  // trip before each spoken sentence. The per-IP ceiling below still applies.
  const callOwnLimiter = (req: Request) =>
    req.method === 'POST' && (req.path === '/avatar/speak' || req.path === '/avatar/query-stream' || /^\/avatar\/session\/[^/]+\/stt-token$/.test(req.path));
  app.use('/api', makeLimiter('api', 60 * 1000, 300, 'Too many API requests', 'verified', (req) => learningOwnLimiter(req) || callOwnLimiter(req)));
  app.use('/api', makeLimiter('api-ip', 60 * 1000, 3000, 'Too many API requests from this network', false, learningOwnLimiter));

  app.use(express.json({ limit: config.requestBodyLimit, verify: captureRawBody }));
  app.use(express.urlencoded({ extended: false, limit: config.formBodyLimit, verify: captureRawBody }));
  app.use(uploadLinkSigning);

  // Files need a signed, expiring link from an API response, bound to the
  // file's owning school (see uploadSigning), and the original must be
  // downloadable: scanned clean, or lesson media. Unscanned, pending,
  // deferred, failed, infected or removed files are never served (P22,
  // owner decision 2026-11-01), whatever link is presented.
  const requireDownloadableUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = path.basename(String(req.params.name ?? req.path));
      const info = await resolveUpload(`/uploads/${name}`);
      if (!isValidUploadSignature(name, req.query.exp, req.query.sig, info.owner)) {
        return res.status(403).json({ error: { code: 'UPLOAD_LINK_INVALID', message: 'This file link is invalid or has expired.' } });
      }
      if (!info.eligibility.downloadable) {
        return res.status(404).json({ error: { code: 'FILE_NOT_AVAILABLE', message: 'The original of this file is not available for download.' } });
      }
      res.setHeader('Cache-Control', 'private, no-store');
      return next();
    } catch (error) {
      return next(error);
    }
  };

  if (isRemoteUploadStorage()) {
    app.get('/uploads/:name', requireDownloadableUpload, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const name = String(req.params.name);
        // Videos are too large to pass through the function; send the viewer to R2.
        if (isVideoFileName(name)) return res.redirect(302, await createDownloadUrl(name));
        const file = await readUpload(name);
        if (!file) return res.status(404).json({ error: 'Not found' });
        res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=900');
        return res.send(file.body);
      } catch (error) {
        return next(error);
      }
    });
  } else if (config.serveLocalUploads) {
    app.use('/uploads', requireDownloadableUpload, express.static(path.resolve(config.uploadDir)));
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'enara-ai-be' });
  });

  // Readiness (P22): required dependencies for this runtime, and which
  // optional services are configured. Configuration presence only for R2 and
  // providers (no network call, no credential or URL in the response).
  app.get('/ready', async (_req: Request, res: Response) => {
    const mongoReady = mongoose.connection.readyState === 1;
    let postgres: 'ok' | 'unavailable' | 'not_configured' = 'not_configured';
    if (config.databaseUrl) {
      try {
        await getPostgresPool().query('SELECT 1');
        postgres = 'ok';
      } catch {
        postgres = 'unavailable';
      }
    }
    const staging = process.env.ENARA_STAGING === 'true';
    // Production needs Postgres (ingestion status); staging and serverless
    // runtimes need R2 for files (no persistent local disk) and, when any AI
    // key is set in staging, the test-spend cap.
    const required: Record<string, boolean> = {
      mongo: mongoReady,
      ...(config.isProduction ? { postgres: postgres === 'ok' } : {}),
      ...(staging || process.env.VERCEL ? { r2Configured: Boolean(config.r2) } : {}),
      ...(staging && config.anthropicApiKey ? { aiTestSpendCap: Boolean(config.aiTestSpend) } : {}),
    };
    const ready = Object.values(required).every(Boolean);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        mongo: mongoReady ? 'ok' : 'unavailable',
        postgres,
        r2: config.r2 ? 'configured' : 'not_configured',
        anthropic: config.anthropicApiKey ? 'configured' : 'not_configured',
        elevenlabs: config.elevenlabs ? 'configured' : 'not_configured',
        anam: config.anam ? 'configured' : 'not_configured',
        aiTestSpendCap: config.aiTestSpend ? 'set' : 'not_set',
      },
      required: Object.keys(required),
    });
  });

  if (config.frontendDir) {
    mountStagingFrontend(app, config.frontendDir);
  }

  setupSwagger(app);

  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/api-docs');
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/curriculums', curriculumRoutes);
  app.use('/api/avatar', avatarRoutes);
  app.use('/api/cron', cronRoutes);
  app.use('/api/tutor-faces', tutorFacesRoutes);
  app.use('/api/batches', batchRoutes);
  app.use('/api/course-instances', courseInstanceRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/assessments', assessmentRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/learning', learningRoutes);
  app.use('/api/assignments', assignmentsRoutes);
  app.use('/api/grading', gradingRoutes);
  app.use('/api/teaching', teachingRoutes);
  app.use('/api/lesson-plans', lessonPlansRoutes);
  app.use('/api/ingestion', ingestionRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/teacher/attendance', teacherAttendanceRoutes);
  app.use('/api/credits', creditsRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/ai-controls', aiControlsRoutes);
  app.use('/api/workspace', workspaceRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/educator-chat', educatorChatRoutes);
  app.use('/api/speaking', speakingRoutes);
  app.use('/api/usage', usageRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.use((_req, _res, next) => {
    next(new AppError('Route not found', 404, 'NOT_FOUND'));
  });
  app.use(errorHandler);

  return app;
}
