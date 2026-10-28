import fs from 'fs';
import path from 'path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { openMongo } from './db';
import { logger, serializeError } from '../utils/logging';

// $0 Railway staging plan: one service serves both the API and the built SPA,
// and the Mongo connection is closed when idle so Railway's app sleeping can
// stop the container (open database connections count as outbound traffic).
// Only wired up when ENARA_STAGING=true (see config/env.ts).

// Legacy frontend-server routes that called providers directly. The SPA only
// reaches them by mistake; keep them closed with the same answer as the
// frontend staging guard.
const LEGACY_PROVIDER_PATHS = ['/api/gemini'];

export function mountStagingFrontend(app: Express, dir: string): void {
  const root = path.resolve(dir);
  const indexFile = path.join(root, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error('Staging isolation check failed: SERVE_FRONTEND_DIR has no index.html');
  }
  // The SPA relies on a CDN stylesheet runtime and inline scripts, as it did
  // behind the frontend server, which sent no CSP. API responses keep helmet's.
  const noCsp = (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Content-Security-Policy');
    next();
  };
  app.use(LEGACY_PROVIDER_PATHS, (_req, res) => {
    res.status(404).json({ message: 'Not available in staging' });
  });
  app.use(express.static(root, { index: false, setHeaders: (res) => res.removeHeader('Content-Security-Policy') }));
  app.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)|health$|ready$|api-docs).*/, noCsp, (_req, res) => {
    res.sendFile(indexFile);
  });
}

export interface IdleDbController {
  middleware: express.RequestHandler;
  stop(): void;
}

// Reconnects before a request when the connection was closed for being idle,
// and closes it again once no request has been active for idleMs.
export function idleDbController(
  idleMs: number,
  open: () => Promise<void> = openMongo,
  checkEveryMs = Math.min(30_000, idleMs),
): IdleDbController {
  let lastActivity = Date.now();
  let active = 0;
  let reconnecting: Promise<void> | null = null;
  let closing: Promise<void> | null = null;

  const ensureOpen = async () => {
    if (closing) await closing;
    if (mongoose.connection.readyState === 1) return;
    reconnecting ??= open().finally(() => {
      reconnecting = null;
    });
    await reconnecting;
  };

  const timer = setInterval(() => {
    if (active > 0 || reconnecting || closing || mongoose.connection.readyState !== 1) return;
    if (Date.now() - lastActivity < idleMs) return;
    logger.info('mongodb_idle_disconnect', { idleMs });
    closing = mongoose
      .disconnect()
      .catch((error) => logger.error('mongodb_idle_disconnect_failed', { error: serializeError(error) }))
      .finally(() => {
        closing = null;
      });
  }, checkEveryMs);
  timer.unref();

  const middleware: express.RequestHandler = (req, res, next) => {
    // Only the API, uploads and the readiness check use the database; static
    // SPA files and /health never wake it.
    if (!/^\/(api|uploads)(\/|$)|^\/ready$/.test(req.path)) return next();
    active += 1;
    lastActivity = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      active -= 1;
      lastActivity = Date.now();
    };
    res.on('finish', finish);
    res.on('close', finish);
    ensureOpen().then(() => next(), next);
  };

  return { middleware, stop: () => clearInterval(timer) };
}
