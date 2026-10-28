import { AppError } from '../middleware/errorHandler';

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new AppError('Refusing insecure upstream URL', 500, 'INSECURE_UPSTREAM_URL');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('Upstream request timed out', 504, 'UPSTREAM_TIMEOUT');
    }
    throw new AppError('Upstream request failed', 502, 'UPSTREAM_FAILURE');
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new AppError('Invalid upstream JSON response', 502, 'UPSTREAM_INVALID_RESPONSE');
  }
}
