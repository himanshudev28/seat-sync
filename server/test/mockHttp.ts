import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface MockRes {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: any;
  ended: boolean;
}

export function mockReq(o: {
  method?: string; url?: string; headers?: Record<string, string>; body?: unknown;
  query?: Record<string, string>; cookies?: Record<string, string>;
} = {}): VercelRequest {
  const headers: Record<string, string> = { host: 'localhost:8080', ...(o.headers ?? {}) };
  if (o.cookies) headers.cookie = Object.entries(o.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return { method: o.method ?? 'GET', url: o.url ?? '/', headers, body: o.body, query: o.query ?? {}, socket: { remoteAddress: '9.9.9.9' } } as unknown as VercelRequest;
}

export function mockRes(): VercelResponse & MockRes {
  const r: any = { statusCode: 200, headers: {}, body: undefined, ended: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.setHeader = (k: string, v: string | string[]) => { r.headers[k.toLowerCase()] = v; return r; };
  r.getHeader = (k: string) => r.headers[k.toLowerCase()];
  r.json = (b: unknown) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

export function cookiesOf(res: MockRes): string[] {
  const c = res.headers['set-cookie'];
  return Array.isArray(c) ? c : c ? [c] : [];
}
export function sessionTokenFrom(res: MockRes): string {
  const c = cookiesOf(res).reverse().find((x) => x.startsWith('ss_session=') && !x.startsWith('ss_session=;'));
  return c ? c.split(';')[0].slice('ss_session='.length) : '';
}
