import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | undefined;

function requiredEnvironmentVariable(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** A stateless server client for Supabase Auth; it never persists a user's session. */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      requiredEnvironmentVariable("SUPABASE_URL"),
      requiredEnvironmentVariable("SUPABASE_ANON_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  }
  return supabaseClient;
}

export function getSupabaseUrl(): string {
  return requiredEnvironmentVariable("SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requiredEnvironmentVariable("SUPABASE_ANON_KEY");
}
