import { useEffect, useState } from "react";
import { storageMode } from "../data/store";
import { getSupabaseClient } from "../data/supabaseClient";
import { parseAuthErrorFromHash } from "../utils/authUrl";

export interface AuthInfo {
  /** True once the session state has been resolved. */
  ready: boolean;
  /** True when it's OK to show the app (always true in local mode). */
  authed: boolean;
  email: string | null;
  /**
   * True when the current session came from a password-recovery link and a
   * new password hasn't been set yet. While true, the app should show the
   * "set new password" screen instead of the normal app or login screen.
   */
  recovering: boolean;
  /**
   * A human-readable message when the page loaded with an auth error in the
   * URL (e.g. an expired or already-used recovery link), else null.
   */
  authError: string | null;
  /** Call after a successful password update to leave recovery mode. */
  completeRecovery: () => void;
}

/**
 * Auth gate. In local (localStorage) mode there are no accounts and the app is
 * always available. In Supabase mode the app requires a signed-in user, so that
 * the (public) anon key can't be used to read student data without logging in.
 */
export function useAuth(): AuthInfo {
  const requiresAuth = storageMode === "supabase";
  const [ready, setReady] = useState(!requiresAuth);
  const [email, setEmail] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!requiresAuth) return;

    const hashError = parseAuthErrorFromHash(window.location.hash);
    if (hashError) {
      setAuthError(hashError);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const sb = getSupabaseClient();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user?.email ?? null);
      setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [requiresAuth]);

  return {
    ready,
    authed: !requiresAuth || Boolean(email),
    email,
    recovering,
    authError,
    completeRecovery: () => setRecovering(false),
  };
}

/** Sign out and reload to a clean state. */
export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
  location.reload();
}
