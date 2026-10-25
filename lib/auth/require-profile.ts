import { getProfile } from './profile';
import { createClient } from '../supabase/server';

export async function requireProfile() {
    const supabase = await createClient();
    const { data: claimsResult } = await supabase.auth.getClaims();
    const userId = claimsResult?.claims?.sub;

    if (typeof userId !== 'string') {
        return null;
    }

    const profile = await getProfile(supabase, userId);
    if (!profile) {
        return null;
    }

    return { supabase, userId, profile };
}
