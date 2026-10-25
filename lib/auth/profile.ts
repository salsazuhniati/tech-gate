import type { SupabaseClient } from '@supabase/supabase-js';

export const roles = ['admin', 'staff', 'manager'] as const;

export type UserRole = (typeof roles)[number];

export type Profile = {
    name: string;
    email: string;
    role: UserRole;
};

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('name, email, role')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data || !roles.includes(data.role as UserRole)) {
        return null;
    }

    return data as Profile;
}
