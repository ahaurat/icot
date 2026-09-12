import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../data/supabaseClient";
import { signOut } from "../state/useAuth";

export default function ResetPasswordScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    onComplete();
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <div>
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="text-sm text-gray-500">Choose a new password for your account.</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">New password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded border p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Confirm password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded border p-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

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
          {busy ? "Updating…" : "Update password"}
        </button>

        <p className="text-center text-sm text-gray-600">
          <button
            type="button"
            disabled={busy}
            className="font-medium text-blue-600 underline"
            onClick={() => void signOut()}
          >
            Cancel and sign out
          </button>
        </p>
      </form>
    </div>
  );
}
