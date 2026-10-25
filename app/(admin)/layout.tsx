import { AdminShell } from '../../components/admin-shell';
import { redirect } from 'next/navigation';
import { getProfile } from '../../lib/auth/profile';
import { createClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const { data: claimsResult } = await supabase.auth.getClaims();
    const claims = claimsResult?.claims;

    if (typeof claims?.sub !== 'string') {
        redirect('/login');
    }

    const profile = await getProfile(supabase, claims.sub);
    if (!profile) {
        redirect('/login');
    }

    const userName = profile.name || (typeof claims.email === 'string' ? claims.email : 'Pengguna Tech Gate');

    return <AdminShell userName={userName} role={profile.role}>{children}</AdminShell>;
}
