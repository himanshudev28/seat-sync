import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_EXPIRED_EVENT } from "@/lib/api";

/**
 * Auth state comes from the server: the HttpOnly `ss_session` cookie is sent automatically and
 * `GET /api/auth/me` says who we are. Nothing auth-related is kept in localStorage.
 */

type User = {
  id: string;
  email: string;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  student_id: string | null;
  course: string | null;
  phone_number: string | null;
};

type AuthContextType = {
  session: null;
  user: User | null;
  profile: Profile | null;
  /** True until the first /me answer (or a network failure) on page load. */
  isLoading: boolean;
  signOut: () => Promise<void>;
  /** After login/register: use the user the endpoint returned (the cookie is already set). */
  setSessionUser: (rawUser: Record<string, unknown>) => void;
  /** Re-read the session from /me (after profile edits, OAuth callback, etc.). True when signed in. */
  refresh: () => Promise<boolean>;
  /** @deprecated The token is ignored: the session is the cookie. Use setSessionUser. */
  loginWithToken: (token: string, rawUser: Record<string, unknown>) => void;
};

const LEGACY_TOKEN_KEY = "auth_token";
const CHANNEL = "seatsync-auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toState(raw: Record<string, unknown>): { user: User; profile: Profile } {
  const id = String(raw.id ?? raw._id ?? "");
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  return {
    user: { id, email: str("email") ?? "" },
    profile: {
      id,
      first_name: str("first_name"),
      last_name: str("last_name"),
      email: str("email"),
      avatar_url: str("avatar_url"),
      is_admin: raw.is_admin === true,
      student_id: str("student_id"),
      course: str("course"),
      phone_number: str("phone_number"),
    },
  };
}

type MeResult = { kind: "user"; raw: Record<string, unknown> } | { kind: "anon" } | { kind: "error" };

async function fetchMe(signal?: AbortSignal): Promise<MeResult> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include", signal, cache: "no-store" });
    if (res.status === 401) return { kind: "anon" };
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as { user?: Record<string, unknown> } & Record<string, unknown>;
    // `{user}` is the contract; accept the old flat shape during the rollout.
    const raw = data.user ?? (data.email ? data : null);
    return raw ? { kind: "user", raw } : { kind: "anon" };
  } catch {
    return { kind: "error" };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const channel = useRef<BroadcastChannel | null>(null);
  /** Bumped by every login/logout/refresh, so a slow initial /me can't overwrite a newer answer. */
  const generation = useRef(0);

  const clear = useCallback(() => {
    setUser(null);
    setProfile(null);
    // Bookings, profile and admin data are per-user: never show them to the next person.
    queryClient.clear();
  }, [queryClient]);

  const apply = useCallback((raw: Record<string, unknown>) => {
    const s = toState(raw);
    setUser(s.user);
    setProfile(s.profile);
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    const r = await fetchMe();
    if (gen !== generation.current) return r.kind === "user";
    if (r.kind === "user") apply(r.raw);
    else if (r.kind === "anon") clear();
    // "error" (offline, 5xx): keep the current state rather than signing the user out.
    setIsLoading(false);
    return r.kind === "user";
  }, [apply, clear]);

  useEffect(() => {
    // Old builds kept a bearer token here; it is no longer used or trusted.
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      /* Safari private mode */
    }

    const ctrl = new AbortController();
    const gen = generation.current;
    void fetchMe(ctrl.signal).then((r) => {
      if (ctrl.signal.aborted || gen !== generation.current) return;
      if (r.kind === "user") apply(r.raw);
      setIsLoading(false);
    });

    // Another tab signed in or out: follow it.
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = (e: MessageEvent) => {
        if (e.data === "signed-out") clear();
        else if (e.data === "signed-in") void refresh();
      };
    }

    // A 401 from any API call (see lib/api) or a legacy "auth-change" event.
    const onExpired = () => clear();
    const onChange = () => void refresh();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener("auth-change", onChange);
    return () => {
      ctrl.abort();
      channel.current?.close();
      channel.current = null;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener("auth-change", onChange);
    };
  }, [apply, clear, refresh]);

  const setSessionUser = useCallback(
    (raw: Record<string, unknown>) => {
      generation.current++;
      apply(raw);
      setIsLoading(false);
      channel.current?.postMessage("signed-in");
    },
    [apply],
  );

  const loginWithToken = useCallback(
    (_token: string, raw: Record<string, unknown>) => setSessionUser(raw),
    [setSessionUser],
  );

  const signOut = useCallback(async () => {
    generation.current++;
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      // 204 expected. Anything else (e.g. a 403 from the Origin check) means the server session
      // may still be alive: say so in the console; locally we still sign out.
      if (!res.ok && res.status !== 401) console.warn(`[auth] logout returned ${res.status}`);
    } catch {
      // Offline: the cookie still expires server-side; clear locally either way.
    }
    clear();
    channel.current?.postMessage("signed-out");
  }, [clear]);

  const value = useMemo<AuthContextType>(
    () => ({ session: null, user, profile, isLoading, signOut, setSessionUser, refresh, loginWithToken }),
    [user, profile, isLoading, signOut, setSessionUser, refresh, loginWithToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
