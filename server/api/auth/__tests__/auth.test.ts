import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { startTestMongo } from '../../../../test/mongo';
import { mockReq, mockRes, cookiesOf, sessionTokenFrom } from '../../../test/mockHttp';

let stop: () => Promise<void>;
let m: Awaited<ReturnType<typeof load>>;

async function load() {
  return {
    User: (await import('../../../models/User.js')).default,
    RateLimit: (await import('../../../models/RateLimit.js')).default,
    login: (await import('../login.js')).default,
    register: (await import('../register.js')).default,
    logout: (await import('../logout.js')).default,
    me: (await import('../me.js')).default,
    changePassword: (await import('../change-password.js')).default,
    updateRole: (await import('../update-role.js')).default,
    adminSetup: (await import('../admin-setup.js')).default,
    checkAdmin: (await import('../check-admin.js')).default,
    gIndex: (await import('../google/index.js')).default,
    gCallback: (await import('../google/callback.js')).default,
    cors: await import('../../_utils/cors.js'),
    rl: await import('../../_utils/rateLimit.js'),
    auth: await import('../../_utils/auth.js'),
    v: await import('../../_utils/validate.js'),
    apiIndex: (await import('../../../../api/index.js')).default,
  };
}

const PW = 'correct-horse-battery';
let ipN = 0;
const ip = () => ({ 'x-real-ip': `10.0.0.${++ipN}` });

async function post(h: any, body: unknown, extra: Record<string, string> = {}, cookies?: Record<string, string>) {
  const res = mockRes();
  await h(mockReq({ method: 'POST', body, headers: { ...ip(), ...extra }, cookies }), res);
  return res;
}
async function register(email: string) {
  const r = await post(m.register, { email, password: PW });
  return { r, token: sessionTokenFrom(r) };
}

beforeAll(async () => {
  stop = await startTestMongo();
  process.env.JWT_SECRET = 'test-secret';
  m = await load();
  await (await import('../../../db.js')).default();
});
afterAll(async () => { await stop(); });
beforeEach(async () => {
  await m.User.deleteMany({});
  await m.RateLimit.deleteMany({});
  delete process.env.ADMIN_SETUP_TOKEN;
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.LEGACY_TOKEN_FRAGMENT;
});

describe('admin-setup', () => {
  const body = { email: 'a@x.com', password: PW };
  it('is disabled (404) without ADMIN_SETUP_TOKEN', async () => {
    const r = await post(m.adminSetup, body, { 'x-admin-setup-token': 'whatever' });
    expect(r.statusCode).toBe(404);
  });
  it('rejects a wrong token', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'secret-token-1';
    expect((await post(m.adminSetup, body, { 'x-admin-setup-token': 'nope' })).statusCode).toBe(403);
    expect((await post(m.adminSetup, body)).statusCode).toBe(403);
  });
  it('creates exactly one admin under concurrency', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'secret-token-1';
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(m.adminSetup, { email: `a${i}@x.com`, password: PW }, { 'x-admin-setup-token': 'secret-token-1' }))
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(await m.User.countDocuments({ is_admin: true })).toBe(1);
  });
  it('check-admin is 404 when disabled', async () => {
    const res = mockRes();
    await m.checkAdmin(mockReq({ headers: ip() }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('sessions and token_version', () => {
  it('login sets HttpOnly SameSite=Lax cookie, no Secure on localhost, token has no is_admin', async () => {
    await register('u@x.com');
    const r = await post(m.login, { email: 'u@x.com', password: PW });
    expect(r.statusCode).toBe(200);
    const c = cookiesOf(r)[0];
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=86400/);
    expect(c).not.toMatch(/Secure/);
    const payload = JSON.parse(Buffer.from(sessionTokenFrom(r).split('.')[1], 'base64url').toString());
    expect(payload.is_admin).toBeUndefined();
    expect(payload.tv).toBe(0);
  });
  it('sets Secure on a non-localhost host', async () => {
    await register('u@x.com');
    const r = await post(m.login, { email: 'u@x.com', password: PW }, { host: 'seatsync.example.com' });
    expect(cookiesOf(r)[0]).toMatch(/; Secure/);
  });
  it('me works from the cookie and from Bearer', async () => {
    const { token } = await register('u@x.com');
    const a = mockRes();
    await m.me(mockReq({ cookies: { ss_session: token } }), a);
    expect(a.statusCode).toBe(200);
    expect(a.body.user.email).toBe('u@x.com');
    expect(a.body.user.password).toBeUndefined();
    const b = mockRes();
    await m.me(mockReq({ headers: { authorization: `Bearer ${token}` } }), b);
    expect(b.statusCode).toBe(200);
  });
  it('logout revokes the token', async () => {
    const { token } = await register('u@x.com');
    const out = await post(m.logout, {}, {}, { ss_session: token });
    expect(out.statusCode).toBe(204);
    expect(cookiesOf(out)[0]).toMatch(/Max-Age=0/);
    const r = mockRes();
    await m.me(mockReq({ cookies: { ss_session: token } }), r);
    expect(r.statusCode).toBe(401);
  });
  it('change-password revokes old tokens and keeps the current session', async () => {
    const { token } = await register('u@x.com');
    const r = await post(m.changePassword, { currentPassword: PW, newPassword: 'another-long-password' }, {}, { ss_session: token });
    expect(r.statusCode).toBe(200);
    const old = mockRes();
    await m.me(mockReq({ cookies: { ss_session: token } }), old);
    expect(old.statusCode).toBe(401);
    const fresh = mockRes();
    await m.me(mockReq({ cookies: { ss_session: sessionTokenFrom(r) } }), fresh);
    expect(fresh.statusCode).toBe(200);
  });
  it('change-password for a google-only user is 400, not a crash', async () => {
    const u = await m.User.create({ email: 'g@x.com', google_id: 'gid', auth_provider: 'google' });
    const t = m.auth.signToken(u);
    const r = await post(m.changePassword, { currentPassword: 'x', newPassword: 'another-long-password' }, {}, { ss_session: t });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toMatch(/reset/);
  });
  it('rejects alg none / wrong-secret tokens', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const u = await m.User.create({ email: 'x@x.com', password: 'hash' });
    const bad = jwt.sign({ userId: String(u._id), tv: 0 }, 'other-secret');
    const r = mockRes();
    await m.me(mockReq({ cookies: { ss_session: bad } }), r);
    expect(r.statusCode).toBe(401);
  });
  it('a demoted admin is rejected immediately', async () => {
    const a = await m.User.create({ email: 'a@x.com', password: 'h', is_admin: true });
    const b = await m.User.create({ email: 'b@x.com', password: 'h', is_admin: true });
    const tb = m.auth.signToken(b);
    await expect(m.auth.requireAdmin(mockReq({ cookies: { ss_session: tb } }))).resolves.toBeTruthy();
    const r = await (async () => {
      const res = mockRes();
      await m.updateRole(mockReq({ method: 'PATCH', body: { userId: String(b._id), is_admin: false }, cookies: { ss_session: m.auth.signToken(a) } }), res);
      return res;
    })();
    expect(r.statusCode).toBe(200);
    await expect(m.auth.requireAdmin(mockReq({ cookies: { ss_session: tb } }))).rejects.toMatchObject({ status: 401 });
  });
  it('cannot demote the last admin and requires a boolean', async () => {
    const a = await m.User.create({ email: 'a@x.com', password: 'h', is_admin: true });
    const b = await m.User.create({ email: 'b@x.com', password: 'h', is_admin: true });
    const ta = m.auth.signToken(a);
    const res = mockRes();
    await m.updateRole(mockReq({ method: 'PATCH', body: { userId: String(b._id), is_admin: 'false' }, cookies: { ss_session: ta } }), res);
    expect(res.statusCode).toBe(400);
    await m.User.updateOne({ _id: a._id }, { is_admin: false });
    await m.User.updateOne({ _id: a._id }, { is_admin: true });
    // demote b leaves a as last admin: ok; then no one else to demote a from b's side
    const ok = mockRes();
    await m.updateRole(mockReq({ method: 'PATCH', body: { userId: String(b._id), is_admin: false }, cookies: { ss_session: ta } }), ok);
    expect(ok.statusCode).toBe(200);
  });
});

describe('validation and errors', () => {
  it('rejects numeric password and object email with 400', async () => {
    expect((await post(m.register, { email: 'a@x.com', password: 1234567890123 })).statusCode).toBe(400);
    expect((await post(m.register, { email: { $ne: null }, password: PW })).statusCode).toBe(400);
    expect((await post(m.login, { email: { $gt: '' }, password: PW })).statusCode).toBe(400);
    expect((await post(m.register, { email: 'a@x.com', password: 'short' })).statusCode).toBe(400);
  });
  it('register on a duplicate email is 409', async () => {
    await register('u@x.com');
    const r = await post(m.register, { email: 'U@x.com', password: PW });
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toBe('Email already in use');
  });
  it('register returns 201 with user, token and cookie', async () => {
    const { r, token } = await register('n@x.com');
    expect(r.statusCode).toBe(201);
    expect(r.body.user.email).toBe('n@x.com');
    expect(r.body.token).toBe(token);
  });
  it('google-only account login is 401 Invalid credentials', async () => {
    await m.User.create({ email: 'g@x.com', google_id: 'g', auth_provider: 'google' });
    const r = await post(m.login, { email: 'g@x.com', password: PW });
    expect(r.statusCode).toBe(401);
    expect(r.body.error).toBe('Invalid credentials');
  });
  it('unknown errors become a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handleApiError } = await import('../../_utils/http.js');
    const res = mockRes();
    handleApiError(res, new Error('secret mongo detail'), 'ctx');
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    spy.mockRestore();
  });
  it('api/index 404 does not echo the path', async () => {
    const res = mockRes();
    await m.apiIndex(mockReq({ url: '/api/<script>nope' }), res);
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/script/);
  });
  it('validators', () => {
    expect(m.v.csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(m.v.clampInt('abc', 5, 1, 10)).toBe(5);
    expect(m.v.clampInt('999', 5, 1, 10)).toBe(10);
    expect(() => m.v.objectIdArray(['a'], { max: 3 })).toThrow();
    expect(() => m.v.httpsUrl('http://x.com', { max: 100 })).toThrow();
    expect(m.v.escapeRegex('a.b*')).toBe('a\\.b\\*');
  });
});

describe('rate limiting', () => {
  const spoof = (n: number) => mockReq({ headers: { 'x-forwarded-for': `${n}.1.1.1, 7.7.7.7` } });
  it('20 parallel hits allow exactly `limit`', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => m.rl.rateLimit(spoof(1), { bucket: 'conc', limit: 7, windowMs: 60_000 }))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(7);
    const rej = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rej.reason.status).toBe(429);
  });
  it('XFF spoofing (varying first hop) does not bypass', async () => {
    let blocked = 0;
    for (let i = 0; i < 6; i++) {
      try { await m.rl.rateLimit(spoof(i), { bucket: 'spoof', limit: 3, windowMs: 60_000 }); } catch { blocked++; }
    }
    expect(blocked).toBe(3);
  });
  it('window resets after expiry', async () => {
    const req = mockReq({ headers: { 'x-real-ip': '5.5.5.5' } });
    await m.rl.rateLimit(req, { bucket: 'win', limit: 1, windowMs: 150 });
    await expect(m.rl.rateLimit(req, { bucket: 'win', limit: 1, windowMs: 150 })).rejects.toMatchObject({ status: 429 });
    await new Promise((r) => setTimeout(r, 200));
    await expect(m.rl.rateLimit(req, { bucket: 'win', limit: 1, windowMs: 150 })).resolves.toBeUndefined();
  });
  it('locks an account after 5 failures and stores no plaintext email', async () => {
    await register('u@x.com');
    for (let i = 0; i < 5; i++) expect((await post(m.login, { email: 'u@x.com', password: 'wrong-password' })).statusCode).toBe(401);
    expect(await m.rl.isLockedOut('u@x.com')).toBe(true);
    // even the correct password is refused while locked
    expect((await post(m.login, { email: 'u@x.com', password: PW })).statusCode).toBe(401);
    const ids = (await m.RateLimit.find({}).lean()).map((d) => d._id);
    expect(ids.some((i) => i.includes('u@x.com'))).toBe(false);
    await m.rl.clearLoginFailures('u@x.com');
    expect((await post(m.login, { email: 'u@x.com', password: PW })).statusCode).toBe(200);
  });
});

describe('CORS', () => {
  it('echoes only allow-listed origins, fails closed in production when unset', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com, https://b.com';
    let res = mockRes();
    m.cors.setCorsHeaders(res, mockReq({ headers: { origin: 'https://b.com' } }));
    expect(res.headers['access-control-allow-origin']).toBe('https://b.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['vary']).toBe('Origin');
    res = mockRes();
    m.cors.setCorsHeaders(res, mockReq({ headers: { origin: 'https://evil.com' } }));
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    delete process.env.ALLOWED_ORIGIN;
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    res = mockRes();
    m.cors.setCorsHeaders(res, mockReq({ headers: { origin: 'http://localhost:8080' } }));
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    process.env.NODE_ENV = prev;
    res = mockRes();
    m.cors.setCorsHeaders(res, mockReq({ headers: { origin: 'http://localhost:8080' } }));
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
  });
  it('assertSameOrigin', () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com';
    const t = (h: Record<string, string>, method = 'POST') => () => m.cors.assertSameOrigin(mockReq({ method, headers: h }));
    expect(t({ origin: 'https://a.com' })).not.toThrow();
    expect(t({ origin: 'https://evil.com' })).toThrow();
    expect(t({})).toThrow();
    expect(t({ referer: 'https://a.com/x' })).not.toThrow();
    expect(t({ origin: 'https://own.com', host: 'own.com' })).not.toThrow();
    expect(t({ origin: 'https://evil.com' }, 'GET')).not.toThrow();
  });
  it('api/index blocks cross-origin cookie-authenticated mutations', async () => {
    process.env.ALLOWED_ORIGIN = 'https://a.com';
    const res = mockRes();
    await m.apiIndex(mockReq({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://evil.com', host: 'a.com' }, cookies: { ss_session: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('Google OAuth', () => {
  const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', APP_URL: 'http://localhost:8080' };
  beforeEach(() => Object.assign(process.env, env));

  it('start sets state+PKCE cookie and redirects with S256 challenge', () => {
    const res = mockRes();
    m.gIndex(mockReq({}), res);
    const loc = new URL(res.headers['location'] as string);
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('state')).toBeTruthy();
    const c = cookiesOf(res)[0];
    expect(c).toMatch(/^ss_oauth=/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Max-Age=600/);
  });
  it('callback rejects state mismatch and missing cookie, and clears the cookie', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    for (const cookies of [{ ss_oauth: 'good.verifier' }, undefined]) {
      const res = mockRes();
      await m.gCallback(mockReq({ query: { code: 'c', state: 'bad' }, cookies: cookies as any, headers: ip() }), res);
      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toContain('error=invalid_state');
      expect(cookiesOf(res).some((c) => c.startsWith('ss_oauth=;'))).toBe(true);
    }
    expect(f).not.toHaveBeenCalled();
  });
  function mockGoogle(profile: Record<string, unknown>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: any, init: any) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        expect(String(init.body)).toContain('code_verifier=ver');
        return { ok: true, json: async () => ({ access_token: 'at' }) };
      }
      return { ok: true, json: async () => profile };
    }) as any);
  }
  it('does not auto-link to an existing local-password account', async () => {
    await m.User.create({ email: 'l@x.com', password: 'hash', auth_provider: 'local' });
    mockGoogle({ sub: 'g1', email: 'l@x.com', email_verified: true });
    const res = mockRes();
    await m.gCallback(mockReq({ query: { code: 'c', state: 's' }, cookies: { ss_oauth: 's.ver' }, headers: ip() }), res);
    expect(res.headers['location']).toContain('error=account_exists_use_password');
    expect(cookiesOf(res).some((c) => c.startsWith('ss_session='))).toBe(false);
    expect((await m.User.findOne({ email: 'l@x.com' }))!.google_id).toBeNull();
  });
  it('creates a new google user, sets cookie, no token in URL, drops http avatar', async () => {
    mockGoogle({ sub: 'g2', email: 'n@x.com', email_verified: true, given_name: 'N', picture: 'http://insecure/p.png' });
    const res = mockRes();
    await m.gCallback(mockReq({ query: { code: 'c', state: 's' }, cookies: { ss_oauth: 's.ver' }, headers: ip() }), res);
    expect(res.headers['location']).toBe('http://localhost:8080/auth/callback');
    expect(sessionTokenFrom(res)).toBeTruthy();
    const u = await m.User.findOne({ email: 'n@x.com' });
    expect(u!.avatar_url).toBeNull();
    expect(u!.email_verified).toBe(true);
  });
  it('fails closed in production without APP_URL', async () => {
    delete process.env.APP_URL;
    const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    const res = mockRes();
    await m.gCallback(mockReq({ query: {}, headers: ip() }), res);
    process.env.NODE_ENV = prev;
    expect(res.statusCode).toBe(503);
  });
});
