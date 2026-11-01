import type { VercelResponse } from '@vercel/node';

export class HttpError extends Error {
  status: number;
  retryAfterSec?: number;
  constructor(status: number, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export const badRequest = (msg = 'Bad request') => new HttpError(400, msg);
export const unauthorized = () => new HttpError(401, 'Authentication required');
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const tooMany = (retryAfterSec = 60) =>
  new HttpError(429, 'Too many requests. Please try again later.', Math.max(1, Math.ceil(retryAfterSec)));

/** Known HttpErrors go out as-is; anything else is logged and returned as a generic 500. */
export function handleApiError(res: VercelResponse, err: unknown, context: string) {
  if (err instanceof HttpError) {
    if (err.status === 429 && err.retryAfterSec) res.setHeader('Retry-After', String(err.retryAfterSec));
    return res.status(err.status).json({ error: err.message });
  }
  console.error(context, err);
  return res.status(500).json({ error: 'Internal server error' });
}
