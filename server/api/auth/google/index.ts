/**
 * GET /api/auth/google
 * Redirects to Google's consent page with a random `state` and a PKCE (S256) challenge.
 * state + verifier live in a short-lived HttpOnly cookie that the callback verifies.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';
import { setCorsHeaders } from '../../_utils/cors.js';
import { appendCookie, cookieAttrs } from '../../_utils/auth.js';
import { handleApiError } from '../../_utils/http.js';

export const OAUTH_COOKIE = 'ss_oauth';

/**
 * Public base URL of the site, used for the OAuth redirect_uri and post-login redirects.
 * APP_URL wins; on Vercel a missing APP_URL falls back to the project's production domain
 * (a Vercel-provided system variable, not the client-controlled Host header), so a missing
 * env var can't break Google sign-in on the live site. Null only off-Vercel in production.
 */
export function getAppUrl(): string | null {
  const u = process.env.APP_URL;
  if (u) return u.replace(/\/$/, '');
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  const prod = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  return prod ? null : 'http://localhost:8080';
}

const b64url = (b: Buffer) => b.toString('base64url');

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const appUrl = getAppUrl();
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured' });
    if (!appUrl) return res.status(503).json({ error: 'Google sign-in is not configured' });

    const state = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());

    appendCookie(res, `${OAUTH_COOKIE}=${state}.${verifier}; ${cookieAttrs(req, 600)}`);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return res.status(302).setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`).end();
  } catch (err) {
    return handleApiError(res, err, '[google/index]');
  }
}
