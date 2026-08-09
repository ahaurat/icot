import { useEffect, useState } from "react";
import { storageMode } from "../data/store";
import { getSupabaseClient } from "../data/supabaseClient";

export interface AuthInfo {
  /** True once the session state has been resolved. */
  ready: boolean;
  /** True when it's OK to show the app (always true in local mode). */
  authed: boolean;
  email: string | null;
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

  useEffect(() => {
    if (!requiresAuth) return;
    const sb = getSupabaseClient();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user?.email ?? null);
      setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [requiresAuth]);

  return { ready, authed: !requiresAuth || Boolean(email), email };
}

/** Sign out and reload to a clean state. */
export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
  location.reload();
}
