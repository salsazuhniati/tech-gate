import { NextResponse } from 'next/server';
import { roles, type UserRole } from '../../../../../../lib/auth/profile';
import { requireAdmin } from '../../../../../../lib/auth/require-admin';

export const dynamic = 'force-dynamic';

function errorResponse(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function isUserRole(value: unknown): value is UserRole {
    return typeof value === 'string' && roles.includes(value as UserRole);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    const session = await requireAdmin();
    if (!session) return errorResponse('Akses admin diperlukan.', 403);

    const { userId } = await params;
    let payload: { role?: unknown };
    try {
        payload = await request.json();
    } catch {
        return errorResponse('Data permintaan tidak valid.', 400);
    }

    if (!isUserRole(payload.role)) return errorResponse('Role pengguna tidak valid.', 400);
    if (userId === session.userId) return errorResponse('Role akun Anda sendiri tidak dapat diubah.', 400);

    const { error } = await session.supabase.rpc('change_profile_role', {
        p_target_user_id: userId,
        p_role: payload.role,
    });

    if (error) {
        if (error.message.includes('akun sendiri') || error.message.includes('admin terakhir') || error.message.includes('tidak ditemukan')) {
            return errorResponse(error.message, 400);
        }

        return errorResponse('Role pengguna tidak dapat diubah. Pastikan migration pengelolaan pengguna telah diterapkan.', 500);
    }

    return NextResponse.json({ userId, role: payload.role });
}
