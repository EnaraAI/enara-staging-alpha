import http from 'http';
import fs from 'fs';
import mongoose from 'mongoose';
import { createApp } from './app';
import { connectDB } from './config/db';
import { closePostgres, connectPostgres } from './config/postgres';
import { getConfig } from './config/env';
import { logger, serializeError } from './utils/logging';

let server: http.Server | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown_started', { signal });

  const forceExit = setTimeout(() => {
    logger.error('shutdown_timeout', { signal });
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
  await Promise.allSettled([mongoose.connection.close(false), closePostgres()]);
  clearTimeout(forceExit);
  logger.info('shutdown_complete', { signal });
  process.exit(0);
}

async function start() {
  const config = getConfig();
  if (config.serveLocalUploads && !fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }

  await connectDB();
  await connectPostgres();

  const app = createApp();
  server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('server_started', {
      port: config.port,
      nodeEnv: config.nodeEnv,
      localUploadsServed: config.serveLocalUploads,
    });
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { error: serializeError(error) });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { error: serializeError(reason) });
  void shutdown('unhandledRejection');
});

start().catch((err) => {
  logger.error('startup_failed', { error: serializeError(err) });
  process.exit(1);
});
