import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnvironment } from './environment';

export function createClient() {
    const { url, publishableKey } = getSupabaseEnvironment();

    return createBrowserClient(url, publishableKey);
}
