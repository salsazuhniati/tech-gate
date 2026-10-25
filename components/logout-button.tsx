'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export function LogoutButton() {
    const router = useRouter();

    async function handleLogout() {
        const supabase = createClient();
        const { error } = await supabase.auth.signOut();

        if (error) {
            return;
        }

        router.replace('/login');
        router.refresh();
    }

    return (
        <button type="button" onClick={handleLogout} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600">
            Keluar
        </button>
    );
}
