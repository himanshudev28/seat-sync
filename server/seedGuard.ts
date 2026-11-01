/** Kept separate from seed.ts so it can be tested without running the seed. */
/**
 * Safety guard: this script DELETES every user, event, seat and booking. Refuse to run
 * against anything but a local MongoDB unless explicitly allowed. Never prints the URI.
 */
export function assertSafeSeedTarget(uri: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (!uri) throw new Error('seed: MONGODB_URI is not set');
  // Hosts sit between '//' and the first '/' or '?', after any credentials; may be a list.
  const afterScheme = uri.split('//')[1] ?? '';
  const hostPart = (afterScheme.split(/[/?]/)[0] ?? '').split('@').pop() ?? '';
  const hosts = hostPart
    .split(',')
    .map((h) => (h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : (h.split(':')[0] ?? '')).toLowerCase())
    .filter(Boolean);
  const local =
    !uri.startsWith('mongodb+srv://') &&
    hosts.length > 0 &&
    hosts.every((h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
  const allowRemote = env.SEED_ALLOW_REMOTE === '1';
  if (!local && !allowRemote) {
    throw new Error(
      'seed: refusing to wipe a non-local database. Point MONGODB_URI at localhost, ' +
        'or set SEED_ALLOW_REMOTE=1 if you really mean it.',
    );
  }
  if (env.NODE_ENV === 'production' && !allowRemote) {
    throw new Error('seed: refusing to run with NODE_ENV=production');
  }
}

