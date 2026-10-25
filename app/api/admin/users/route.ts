import { NextResponse } from 'next/server';
import { roles, type UserRole } from '../../../../lib/auth/profile';
import { requireAdmin } from '../../../../lib/auth/require-admin';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

type UserProfile = { user_id: string; name: string; email: string; role: UserRole; created_at: string };

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isUserRole(value: unknown): value is UserRole {
    return typeof value === 'string' && roles.includes(value as UserRole);
}

export async function GET() {
    const session = await requireAdmin();
    if (!session) return errorResponse('Akses admin diperlukan.', 403);

    try {
        const { data, error } = await createAdminClient()
            .from('profiles')
            .select('user_id, name, email, role, created_at')
            .order('name');

        if (error) return errorResponse('Daftar pengguna tidak dapat dimuat.', 500);

        const users = (data ?? []).filter((profile): profile is UserProfile => isUserRole(profile.role));
        return NextResponse.json({ users, currentUserId: session.userId });
    } catch {
        return errorResponse('Konfigurasi pengelolaan pengguna belum lengkap.', 503);
    }
}

export async function POST(request: Request) {
    const session = await requireAdmin();
    if (!session) return errorResponse('Akses admin diperlukan.', 403);

    let payload: { name?: unknown; email?: unknown; password?: unknown; role?: unknown };
    try {
        payload = await request.json();
    } catch {
        return errorResponse('Data permintaan tidak valid.', 400);
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!name || name.length > 100 || !isValidEmail(email) || password.length < 8 || password.length > 72 || !isUserRole(payload.role)) {
        return errorResponse('Nama, email, role, dan kata sandi awal yang valid wajib diisi. Kata sandi harus terdiri dari 8–72 karakter.', 400);
    }

    try {
        const admin = createAdminClient();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name },
        });

        if (createError || !created.user) {
            return errorResponse('Akun tidak dapat dibuat. Email mungkin sudah terdaftar.', 409);
        }

        const { data: profile, error: profileError } = await admin
            .from('profiles')
            .update({ role: payload.role })
            .eq('user_id', created.user.id)
            .select('user_id, name, email, role, created_at')
            .maybeSingle();

        if (profileError || !profile || !isUserRole(profile.role)) {
            await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
            return errorResponse('Akun tidak dapat diselesaikan karena profil pengguna gagal dibuat.', 500);
        }

        return NextResponse.json({ user: profile as UserProfile }, { status: 201 });
    } catch {
        return errorResponse('Konfigurasi pengelolaan pengguna belum lengkap.', 503);
    }
}
