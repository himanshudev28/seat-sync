import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { signToken, setSessionCookie } from '../_utils/auth.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { HttpError, handleApiError } from '../_utils/http.js';
import { rateLimit, noteLoginFailure, isLockedOut, clearLoginFailures } from '../_utils/rateLimit.js';
import { email as vEmail } from '../_utils/validate.js';

// Valid bcrypt hash of a random string, compared when the user is missing (constant-time-ish).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
const invalid = () => new HttpError(401, 'Invalid credentials');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await rateLimit(req, { bucket: 'login', limit: 10, windowMs: 60_000 });
    await dbConnect();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = vEmail(body.email);
    const password = body.password;
    if (typeof password !== 'string' || password.length === 0 || password.length > 72) throw invalid();

    if (await isLockedOut(email)) throw invalid();

    const user = await User.findOne({ email }).select('+password');
    const hash = user?.password || DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!user || !user.password || !ok) {
      await noteLoginFailure(email);
      throw invalid();
    }
    await clearLoginFailures(email);

    const token = signToken(user);
    setSessionCookie(res, token, req);

    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    delete userObj.token_version;

    // TODO(auth-migration): drop `token` from the body once clients use the cookie only.
    return res.status(200).json({ token, user: { ...userObj, id: String(user._id) } });
  } catch (err) {
    return handleApiError(res, err, '[api/auth/login]');
  }
}
