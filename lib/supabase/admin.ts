import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnvironment } from './environment';

export function createAdminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
    }

    const { url } = getSupabaseEnvironment();

    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }, 
    });
}
