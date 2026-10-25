'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { roles, type UserRole } from '../lib/auth/profile';

type UserProfile = { user_id: string; name: string; email: string; role: UserRole; created_at: string };
type ApiError = { error?: string };

const roleLabel: Record<UserRole, string> = { admin: 'Admin', manager: 'Manager', staff: 'Staff' };
const roleClass: Record<UserRole, string> = { admin: 'bg-blue-50 text-blue-700', manager: 'bg-violet-50 text-violet-700', staff: 'bg-slate-100 text-slate-700' };

async function readResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as T & ApiError;
    if (!response.ok) throw new Error(body.error || 'Operasi tidak dapat diselesaikan.');
    return body;
}

export function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [selectedRole, setSelectedRole] = useState<'all' | UserRole>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [changingUser, setChangingUser] = useState<UserProfile | null>(null);
    const [nextRole, setNextRole] = useState<UserRole>('staff');
    const [isChangingRole, setIsChangingRole] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true); setError(null);
        try {
            const result = await readResponse<{ users: UserProfile[]; currentUserId: string }>(await fetch('/api/admin/users', { cache: 'no-store' }));
            setUsers(result.users);
            setCurrentUserId(result.currentUserId);
        } catch (loadError) {
            setUsers([]);
            setCurrentUserId(null);
            setError(loadError instanceof Error ? loadError.message : 'Data pengguna tidak dapat dimuat.');
        } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const visibleUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
        return users.filter((user) => {
            const matchesRole = selectedRole === 'all' || user.role === selectedRole;
            const matchesQuery = !normalizedQuery || [user.name, user.email, roleLabel[user.role]].some((value) => value.toLocaleLowerCase('id-ID').includes(normalizedQuery));
            return matchesRole && matchesQuery;
        });
    }, [query, selectedRole, users]);

    async function createUser(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setIsCreating(true); setError(null); setNotice(null);
        try {
            const result = await readResponse<{ user: UserProfile }>(await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), role: form.get('role') }) }));
            setUsers((currentUsers) => [...currentUsers, result.user].sort((a, b) => a.name.localeCompare(b.name, 'id-ID')));
            setShowCreateForm(false); setNotice('Akun pengguna berhasil dibuat.');
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Akun pengguna tidak dapat dibuat.');
        } finally { setIsCreating(false); }
    }

    async function changeRole() {
        if (!changingUser || changingUser.role === nextRole) { setChangingUser(null); return; }
        if (!window.confirm(`Ubah role ${changingUser.name || changingUser.email} menjadi ${roleLabel[nextRole]}?`)) return;
        setIsChangingRole(true); setError(null); setNotice(null);
        try {
            await readResponse<{ userId: string; role: UserRole }>(await fetch(`/api/admin/users/${changingUser.user_id}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: nextRole }) }));
            setUsers((currentUsers) => currentUsers.map((user) => user.user_id === changingUser.user_id ? { ...user, role: nextRole } : user));
            setChangingUser(null); setNotice('Role pengguna berhasil diperbarui.');
        } catch (changeError) {
            setError(changeError instanceof Error ? changeError.message : 'Role pengguna tidak dapat diperbarui.');
        } finally { setIsChangingRole(false); }
    }

    return <div>
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Sistem</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Pengguna</h1><p className="mt-2 text-slate-500">Kelola akun pengguna dan akses sistem toko.</p></div><div className="flex gap-3"><button className="rounded-xl px-5 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400" disabled={isLoading} onClick={() => void load()} type="button">{isLoading ? 'Memuat...' : 'Muat ulang'}</button><button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700" onClick={() => { setError(null); setNotice(null); setShowCreateForm(true); }} type="button">+ Tambah pengguna</button></div></div>
        {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
        {error && <section className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700"><p className="font-bold">Operasi pengguna gagal</p><p className="mt-1">{error}</p><button className="mt-3 font-bold text-red-700 underline" onClick={() => void load()} type="button">Muat ulang data</button></section>}
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6"><div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]"><label className="block"><span className="sr-only">Cari pengguna</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau email..." type="search" value={query} /></label><label className="block"><span className="sr-only">Filter role</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setSelectedRole(event.target.value as 'all' | UserRole)} value={selectedRole}><option value="all">Semua role</option>{roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label></div></section>
        <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="overflow-x-auto"><table className="w-full min-w-200 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-6 py-4">Pengguna</th><th className="px-6 py-4">Email</th><th className="px-6 py-4">Role</th><th className="px-6 py-4">Terdaftar</th><th className="px-6 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td className="px-6 py-12 text-center text-slate-500" colSpan={5}>Memuat data pengguna...</td></tr> : !error && visibleUsers.length === 0 ? <tr><td className="px-6 py-12 text-center text-slate-500" colSpan={5}>{users.length === 0 ? 'Belum ada pengguna.' : 'Tidak ada pengguna yang sesuai dengan pencarian atau filter.'}</td></tr> : visibleUsers.map((user) => <tr key={user.user_id}><td className="px-6 py-4 font-bold text-[#0b2254]">{user.name || roleLabel[user.role]}</td><td className="px-6 py-4 text-slate-600">{user.email}</td><td className="px-6 py-4"><span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + roleClass[user.role]}>{roleLabel[user.role]}</span></td><td className="px-6 py-4 text-slate-600">{new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.created_at))}</td><td className="px-6 py-4 text-right">{user.user_id === currentUserId ? <span className="text-xs font-semibold text-slate-400">Akun sendiri</span> : <button className="font-bold text-blue-600 hover:text-blue-700" onClick={() => { setNextRole(user.role); setChangingUser(user); }} type="button">Ubah role</button>}</td></tr>)}</tbody></table></div></section>
        {showCreateForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-5" role="dialog" aria-label="Tambah pengguna" aria-modal="true"><form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8" onSubmit={(event) => void createUser(event)}><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#0b2254]">Tambah pengguna</h2><p className="mt-1 text-sm text-slate-500">Buat akun baru dengan akses awal yang sesuai.</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={isCreating} onClick={() => setShowCreateForm(false)} type="button">Tutup</button></div><div className="mt-6 grid gap-5"><Field label="Nama" name="name" required /><Field label="Email" name="email" required type="email" /><Field label="Kata sandi awal" name="password" required type="password" minLength={8} maxLength={72} /><label><span className="mb-2 block text-sm font-bold text-slate-700">Role awal</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" defaultValue="staff" name="role">{roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label></div><div className="mt-8 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={isCreating} onClick={() => setShowCreateForm(false)} type="button">Batal</button><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-blue-300" disabled={isCreating} type="submit">{isCreating ? 'Membuat...' : 'Buat akun'}</button></div></form></div>}
        {changingUser && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-5" role="dialog" aria-label="Ubah role pengguna" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#0b2254]">Ubah role</h2><p className="mt-1 text-sm text-slate-500">{changingUser.name || changingUser.email}</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={isChangingRole} onClick={() => setChangingUser(null)} type="button">Tutup</button></div><label className="mt-6 block"><span className="mb-2 block text-sm font-bold text-slate-700">Role pengguna</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={isChangingRole} onChange={(event) => setNextRole(event.target.value as UserRole)} value={nextRole}>{roles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label><p className="mt-4 text-sm text-slate-500">Perubahan role akan dikonfirmasi sebelum disimpan. Role akun Anda sendiri tidak dapat diubah.</p><div className="mt-8 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={isChangingRole} onClick={() => setChangingUser(null)} type="button">Batal</button><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-blue-300" disabled={isChangingRole || nextRole === changingUser.role} onClick={() => void changeRole()} type="button">{isChangingRole ? 'Menyimpan...' : 'Simpan role'}</button></div></div></div>}
    </div>;
}

function Field({ label, name, type = 'text', required = false, minLength, maxLength }: { label: string; name: string; type?: string; required?: boolean; minLength?: number; maxLength?: number }) {
    return <label><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" maxLength={maxLength} minLength={minLength} name={name} required={required} type={type} /></label>;
}
