import { NextResponse } from 'next/server';
import { requireProfile } from '../../../../../lib/auth/require-profile';
import { createAdminClient } from '../../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function GET() {
    const session = await requireProfile();
    if (!session) return errorResponse('Akses profil diperlukan.', 403);

    const { data, error } = await session.supabase
        .from('profiles')
        .select('name, email, phone, role')
        .eq('user_id', session.userId)
        .maybeSingle();

    if (error || !data) return errorResponse('Profil tidak dapat dimuat.', 500);

    const { data: userResult } = await session.supabase.auth.getUser();
    const metadataName = userResult.user?.user_metadata.name;
    const name = data.name.trim() || (typeof metadataName === 'string' ? metadataName.trim() : '');

    return NextResponse.json({ profile: { name, email: data.email, phone: data.phone ?? '', role: data.role } });
}

export async function PATCH(request: Request) {
    const session = await requireProfile();
    if (!session) return errorResponse('Akses profil diperlukan.', 403);

    let payload: { name?: unknown; phone?: unknown };
    try {
        payload = await request.json();
    } catch {
        return errorResponse('Data permintaan tidak valid.', 400);
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
    if (!name || name.length > 100 || (phone && !/^[0-9+ ()-]{6,25}$/.test(phone))) {
        return errorResponse('Nama wajib diisi. Nomor telepon, bila diisi, harus terdiri dari 6–25 karakter yang valid.', 400);
    }

    try {
        const { data, error } = await createAdminClient()
            .from('profiles')
            .update({ name, phone: phone || null })
            .eq('user_id', session.userId)
            .select('name, email, phone, role')
            .maybeSingle();

        if (error || !data) return errorResponse('Profil tidak dapat diperbarui.', 500);

        return NextResponse.json({ profile: { name: data.name, email: data.email, phone: data.phone ?? '', role: data.role } });
    } catch {
        return errorResponse('Konfigurasi pengelolaan profil belum lengkap.', 503);
    }
}
