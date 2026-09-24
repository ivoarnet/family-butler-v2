import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAuthConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

const cleanString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const getBuildTimeSupabaseAuthConfig = (): SupabaseAuthConfig | null => {
  const supabaseUrl = cleanString(import.meta.env.VITE_SUPABASE_URL);
  const supabasePublishableKey = cleanString(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }
  return { supabaseUrl, supabasePublishableKey };
};

export const createSupabaseClient = ({ supabaseUrl, supabasePublishableKey }: SupabaseAuthConfig): SupabaseClient =>
  createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
