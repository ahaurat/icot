import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../data/supabaseClient";

type Mode = "signin" | "signup" | "reset";

export default function LoginScreen({ authError }: { authError?: string | null }) {
  const [mode, setMode] = useState<Mode>(authError ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabaseClient();

    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is on: no session until the emailed link is clicked.
        setConfirmSent(true);
      }
      // If a session exists (confirmation disabled), useAuth swaps in the app.
    } else if (mode === "reset") {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setError(error.message);
      } else {
        setConfirmSent(true);
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // On success, useAuth's onAuthStateChange swaps in the app.
    }
    setBusy(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirmSent(false);
    setPassword("");
  }

  if (confirmSent) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-gray-600">
            {mode === "reset" ? (
              <>
                We sent a password reset link to{" "}
                <span className="font-medium">{email}</span>. Click it to choose a new
                password.
              </>
            ) : (
              <>
                We sent a confirmation link to{" "}
                <span className="font-medium">{email}</span>. Click it to activate your
                account, then sign in.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="w-full rounded bg-blue-500 px-4 py-2 text-white"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">ICOT</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            In class. On task.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            {isSignup
              ? "Create your teacher account."
              : isReset
                ? "Reset your password."
                : "Sign in to continue."}
          </p>
        </div>

        {authError && isReset && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {authError}. Request a new link below.
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            className="mt-1 w-full rounded border p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {!isReset && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="mt-1 w-full rounded border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {!isSignup && !isReset && (
          <p className="text-right text-sm">
            <button
              type="button"
              disabled={busy}
              className="font-medium text-blue-600 underline"
              onClick={() => switchMode("reset")}
            >
              Forgot password?
            </button>
          </p>
        )}

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy
            ? isSignup
              ? "Creating account…"
              : isReset
                ? "Sending…"
                : "Signing in…"
            : isSignup
              ? "Sign up"
              : isReset
                ? "Send reset link"
                : "Sign in"}
        </button>

        <p className="text-center text-sm text-gray-600">
          {isReset ? (
            <button
              type="button"
              disabled={busy}
              className="font-medium text-blue-600 underline"
              onClick={() => switchMode("signin")}
            >
              Back to sign in
            </button>
          ) : isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                disabled={busy}
                className="font-medium text-blue-600 underline"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                type="button"
                disabled={busy}
                className="font-medium text-blue-600 underline"
                onClick={() => switchMode("signup")}
              >
                Create an account
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
