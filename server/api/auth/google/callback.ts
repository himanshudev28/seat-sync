/**
 * GET /api/auth/google/callback
 * Verifies state + PKCE verifier from the ss_oauth cookie, exchanges the code, then signs the user in
 * by setting the HttpOnly session cookie and redirecting to ${APP_URL}/auth/callback (no token in URL).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import dbConnect from '../../../db.js';
import User from '../../../models/User.js';
import { signToken, setSessionCookie, appendCookie, cookieAttrs, parseCookies } from '../../_utils/auth.js';
import { setCorsHeaders } from '../../_utils/cors.js';
import { HttpError } from '../../_utils/http.js';
import { rateLimit } from '../../_utils/rateLimit.js';
import { OAUTH_COOKIE, getAppUrl } from './index.js';

interface GoogleTokenResponse { access_token: string; id_token?: string; error?: string; error_description?: string }
interface GoogleUserInfo {
  sub: string; email: string; email_verified: boolean;
  name?: string; given_name?: string; family_name?: string; picture?: string;
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const httpsOrNull = (u?: string) => {
  try { return u && new URL(u).protocol === 'https:' ? u : null; } catch { return null; }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const appUrl = getAppUrl();
  if (!appUrl) return res.status(503).json({ error: 'Google sign-in is not configured' }); // fail closed
  const fail = (code: string) =>
    res.status(302).setHeader('Location', `${appUrl}/auth?error=${encodeURIComponent(code)}`).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('google_not_configured');

  try {
    await rateLimit(req, { bucket: 'google-callback', limit: 20, windowMs: 10 * 60_000 });
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) return fail('rate_limited');
    throw e;
  }

  // Always consume the one-time cookie.
  const stored = parseCookies(req)[OAUTH_COOKIE] || '';
  appendCookie(res, `${OAUTH_COOKIE}=; ${cookieAttrs(req, 0)}`);

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  if (req.query.error || !code) return fail('oauth_denied');

  const [cState, verifier] = stored.split('.');
  if (!state || !cState || !verifier || !safeEq(state, cState)) return fail('invalid_state');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || tokens.error) {
      console.error('[google/callback] token exchange failed:', tokens.error ?? tokenRes.status);
      return fail('token_exchange_failed');
    }

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return fail('userinfo_failed');
    const g = (await infoRes.json()) as GoogleUserInfo;
    if (!g.sub || !g.email || g.email_verified !== true) return fail('email_not_verified');

    await dbConnect();
    const email = g.email.toLowerCase();
    const avatar = httpsOrNull(g.picture);

    let user = await User.findOne({ google_id: g.sub });
    if (!user) {
      const byEmail = await User.findOne({ email });
      if (byEmail) {
        // Never auto-link a Google identity to an existing account by email.
        return fail('account_exists_use_password');
      }
      user = await User.create({
        email,
        first_name: g.given_name || null,
        last_name: g.family_name || null,
        avatar_url: avatar,
        google_id: g.sub,
        auth_provider: 'google',
        email_verified: true,
        is_admin: false,
      });
    } else {
      if (!user.first_name) user.first_name = g.given_name || null;
      if (!user.last_name) user.last_name = g.family_name || null;
      if (!user.avatar_url && avatar) user.avatar_url = avatar;
      await user.save();
    }

    const token = signToken(user);
    setSessionCookie(res, token, req);

    // TODO(auth-migration): remove LEGACY_TOKEN_FRAGMENT once the client no longer reads #token=.
    const frag = process.env.LEGACY_TOKEN_FRAGMENT === '1' ? `#token=${token}` : '';
    return res.status(302).setHeader('Location', `${appUrl}/auth/callback${frag}`).end();
  } catch (err) {
    console.error('[google/callback] unexpected error:', err);
    return fail('server_error');
  }
}
