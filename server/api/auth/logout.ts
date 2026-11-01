import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../_utils/cors.js';
import { clearSessionCookie, bumpTokenVersion, requireAuth } from '../_utils/auth.js';
import { handleApiError } from '../_utils/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Revoke every issued token for this user. If the caller isn't authenticated, just clear the cookie.
    try {
      const { userId } = await requireAuth(req);
      await bumpTokenVersion(userId);
    } catch { /* not logged in or invalid token: nothing to revoke */ }
    clearSessionCookie(res, req);
    return res.status(204).end();
  } catch (err) {
    return handleApiError(res, err, '[api/auth/logout]');
  }
}
