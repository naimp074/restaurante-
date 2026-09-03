import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const getSupabase = (): SupabaseClient => {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.'
    );
  }
  return supabase;
};
