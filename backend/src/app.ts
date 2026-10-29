import { createDownloadUrl, isRemoteUploadStorage, readUpload } from './services/uploadStorage';
import { isVideoFileName } from './utils/uploadSecurity';
import express, { NextFunction, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { idleDbController, mountStagingFrontend } from './config/stagingSingleService';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import path from 'path';
import { getConfig } from './config/env';
import { setupSwagger } from './config/swagger';
import { errorHandler, AppError } from './middleware/errorHandler';
import { isValidUploadSignature, uploadLinkSigning } from './utils/uploadSigning';
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
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.corsAllowedOrigins.includes(origin));
    },
  };
}

function makeLimiter(name: string, windowMs: number, max: number, message: string, perUser = false, skip?: (req: Request) => boolean) {
  return rateLimit({
    windowMs,
    max,
    ...(skip ? { skip } : {}),
    store: new MongoRateLimitStore(name),
    // Don't take the API down if the counter store fails.
    passOnStoreError: true,
    // Per signed-in user where a school's students share one IP address.
    ...(perUser
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
  app.use('/api', makeLimiter('api', 60 * 1000, 300, 'Too many API requests', false, (req) => req.path.startsWith('/learning/') && req.path !== '/learning/objectives/extract'));

  app.use(express.json({ limit: config.requestBodyLimit, verify: captureRawBody }));
  app.use(express.urlencoded({ extended: false, limit: config.formBodyLimit, verify: captureRawBody }));
  app.use(uploadLinkSigning);

  // Files need a signed, expiring link from an API response (see uploadSigning).
  const requireUploadSignature = (req: Request, res: Response, next: NextFunction) => {
    const name = path.basename(String(req.params.name ?? req.path));
    if (!isValidUploadSignature(name, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: { code: 'UPLOAD_LINK_INVALID', message: 'This file link is invalid or has expired.' } });
    }
    return next();
  };

  if (isRemoteUploadStorage()) {
    app.get('/uploads/:name', requireUploadSignature, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const name = String(req.params.name);
        // Videos are too large to pass through the function; send the viewer to R2.
        if (isVideoFileName(name)) return res.redirect(302, await createDownloadUrl(name));
        const file = await readUpload(name);
        if (!file) return res.status(404).json({ error: 'Not found' });
        res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(file.body);
      } catch (error) {
        return next(error);
      }
    });
  } else if (config.serveLocalUploads) {
    app.use('/uploads', requireUploadSignature, express.static(path.resolve(config.uploadDir)));
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'enara-ai-be' });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    const mongoReady = mongoose.connection.readyState === 1;
    let postgresReady = false;
    if (config.databaseUrl) {
      try {
        await getPostgresPool().query('SELECT 1');
        postgresReady = true;
      } catch {
        postgresReady = false;
      }
    } else {
      postgresReady = !config.isProduction;
    }

    const ready = mongoReady && postgresReady;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        mongo: mongoReady ? 'ok' : 'unavailable',
        postgres: postgresReady ? 'ok' : 'unavailable',
      },
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
