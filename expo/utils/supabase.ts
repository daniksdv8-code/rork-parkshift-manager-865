import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData } from '@/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const TABLE = 'park_data';
const ROW_ID = 'main';

export async function initSupabaseTable(): Promise<boolean> {
  if (!supabase) {
    console.log('[Supabase] No credentials, skipping init');
    return false;
  }
  try {
    const { error } = await supabase.from(TABLE).select('id').eq('id', ROW_ID).single();
    if (error && error.code === 'PGRST116') {
      console.log('[Supabase] Row not found, creating initial row');
      const { error: insertErr } = await supabase.from(TABLE).insert({ id: ROW_ID, data: {}, updated_at: new Date().toISOString() });
      if (insertErr) {
        console.log('[Supabase] Insert error (table may not exist):', insertErr.message);
        return false;
      }
      return true;
    }
    if (error) {
      console.log('[Supabase] Table check error:', error.message, error.code);
      return false;
    }
    return true;
  } catch (e) {
    console.log('[Supabase] Init error:', e);
    return false;
  }
}

export async function loadFromSupabase(): Promise<AppData | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('id', ROW_ID)
      .single();

    if (error) {
      console.log('[Supabase] Load error:', error.message);
      return null;
    }
    if (data?.data && typeof data.data === 'object') {
      console.log('[Supabase] Data loaded successfully');
      return data.data as AppData;
    }
    return null;
  } catch (e) {
    console.log('[Supabase] Load exception:', e);
    return null;
  }
}

export async function saveToSupabase(appData: AppData): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert({
        id: ROW_ID,
        data: appData,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.log('[Supabase] Save error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.log('[Supabase] Save exception:', e);
    return false;
  }
}

export function subscribeToChanges(
  onData: (newData: AppData) => void,
): (() => void) | null {
  if (!supabase) return null;

  const channel = supabase
    .channel('park_data_sync')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: TABLE,
        filter: `id=eq.${ROW_ID}`,
      },
      (payload) => {
        const newRow = payload.new as { data?: AppData };
        if (newRow?.data && typeof newRow.data === 'object') {
          console.log('[Supabase] Realtime update received');
          onData(newRow.data);
        }
      },
    )
    .subscribe((status) => {
      console.log('[Supabase] Realtime subscription status:', status);
    });

  return () => {
    void supabase!.removeChannel(channel);
  };
}
