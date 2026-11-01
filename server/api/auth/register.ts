import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../db.js';
import User from '../../models/User.js';
import { signToken, setSessionCookie } from '../_utils/auth.js';
import { setCorsHeaders } from '../_utils/cors.js';
import { HttpError, handleApiError } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { email as vEmail, password as vPassword, str } from '../_utils/validate.js';

const optStr = (v: unknown, max: number) => (v === undefined || v === null || v === '' ? undefined : str(v, { max }));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await rateLimit(req, { bucket: 'register', limit: 5, windowMs: 60 * 60_000 });
    await dbConnect();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = vEmail(body.email);
    const password = vPassword(body.password);
    const first_name = optStr(body.first_name, 100);
    const last_name = optStr(body.last_name, 100);
    const student_id = optStr(body.student_id, 50);
    const phone_number = optStr(body.phone_number, 30);

    // M7 tradeoff: there is no email-verification flow yet, so auto-login after sign-up needs a clear
    // 201 vs 409. Account enumeration is blunted by the per-IP register limit (5/hour) rather than a
    // generic response. Revisit when email verification exists.
    const dup = () => new HttpError(409, 'Email already in use');
    if (await User.exists({ email })) throw dup();

    let user;
    try {
      user = await User.create({ email, password, first_name, last_name, student_id, phone_number, email_verified: false });
    } catch (e: any) {
      if (e?.code === 11000) throw dup();
      throw e;
    }

    const token = signToken(user);
    setSessionCookie(res, token, req);

    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    delete userObj.token_version;

    // TODO(auth-migration): drop `token` from the body once clients use the cookie only.
    return res.status(201).json({ token, user: { ...userObj, id: String(user._id) } });
  } catch (err) {
    return handleApiError(res, err, '[api/auth/register]');
  }
}
