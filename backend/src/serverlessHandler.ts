import type { IncomingMessage, ServerResponse } from 'http';
import { DB_RETRY_AFTER_SECONDS, dbUnavailable, markDbUnavailable } from './config/dbAvailability';
import { logger, serializeError } from './utils/logging';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

function sendUnavailable(res: ServerResponse) {
  const message = 'The service is busy. Please try again in a few seconds.';
  res.statusCode = 503;
  res.setHeader('Retry-After', String(DB_RETRY_AFTER_SECONDS));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message }, message }));
}

// Connects once per warm instance, then hands every request to the app. If the
// connection fails (P20: Atlas refusing connections at a simultaneous start),
// answer 503 with Retry-After at once instead of throwing, and do not try to
// connect again until the cool-down has passed.
export function serverlessHandler(app: Handler, connect: () => Promise<void>) {
  let ready: Promise<void> | undefined;
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    if (!ready) {
      if (dbUnavailable()) return sendUnavailable(res);
      ready = connect();
      ready.catch((error) => {
        ready = undefined;
        markDbUnavailable();
        logger.error('serverless_connect_failed', { error: serializeError(error) });
      });
    }
    try {
      await ready;
    } catch {
      return sendUnavailable(res);
    }
    return app(req, res);
  };
}
