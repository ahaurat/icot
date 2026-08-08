import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both Supabase env vars are present, enabling cloud sync. */
export const hasSupabaseConfig = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!hasSupabaseConfig) {
      throw new Error("Supabase is not configured (missing env vars).");
    }
    client = createClient(url!, anonKey!);
  }
  return client;
}
