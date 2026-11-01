/** OAuth `?error=<code>` values from the server, as messages people can act on. Shared by /auth and /auth/callback. */
export const OAUTH_ERRORS: Record<string, string> = {
  invalid_state: "The sign-in link expired or was tampered with. Please try again.",
  oauth_denied: "You cancelled the Google sign-in.",
  token_exchange_failed: "Google sign-in didn't complete. Please try again.",
  userinfo_failed: "We couldn't read your Google profile. Please try again.",
  email_not_verified: "Your Google email isn't verified yet. Verify it with Google, then try again.",
  account_exists_use_password: "This email already has a password account. Sign in with your password.",
  rate_limited: "Too many sign-in attempts. Please wait a minute and try again.",
  google_not_configured: "Google sign-in isn't set up on this site. Use your email and password.",
  server_error: "Something went wrong on our side. Please try again.",
};

export function oauthErrorMessage(code: string | null): string {
  if (!code) return "";
  return OAUTH_ERRORS[code] ?? "Sign-in didn't complete. Please try again.";
}

/** Minimum password length, matching the server's rule. */
export const MIN_PASSWORD_LENGTH = 10;

/** Server maximum (bcrypt only uses the first 72 bytes). */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * A message for auth responses whose status says more than their body: 409 (email in use) and
 * 429 (rate limited, with Retry-After). Returns null for anything else so callers keep their own handling.
 * Read before `response.json()`: a 429 from the rate limiter may not be JSON.
 */
export function authStatusMessage(response: Response): string | null {
  if (response.status === 409) return "That email already has an account. Sign in instead.";
  if (response.status === 429) {
    const secs = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(secs) && secs > 0) {
      const wait = secs < 90 ? `${Math.ceil(secs)} seconds` : `${Math.ceil(secs / 60)} minutes`;
      return `Too many attempts. Please try again in ${wait}.`;
    }
    return "Too many attempts. Please wait a moment and try again.";
  }
  return null;
}
