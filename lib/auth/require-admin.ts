import { requireProfile } from './require-profile';

export async function requireAdmin() {
    const session = await requireProfile();
    if (!session || session.profile.role !== 'admin') {
        return null;
    }

    return session;
}
