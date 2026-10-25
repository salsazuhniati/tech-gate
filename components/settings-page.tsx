'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Profile = { name: string; email: string; phone: string; role: string };
type ApiError = { error?: string };

const roleLabel: Record<string, string> = { admin: 'Admin', manager: 'Manager', staff: 'Staff' };

function initials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'TG';
}

async function readResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as T & ApiError;
    if (!response.ok) throw new Error(body.error || 'Operasi tidak dapat diselesaikan.');
    return body;
}

export function SettingsPage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await readResponse<{ profile: Profile }>(await fetch('/api/admin/settings/profile', { cache: 'no-store' }));
            setProfile(result.profile);
            setName(result.profile.name);
            setPhone(result.profile.phone);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Profil tidak dapat dimuat.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            const result = await readResponse<{ profile: Profile }>(await fetch('/api/admin/settings/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone }),
            }));
            setProfile(result.profile);
            setName(result.profile.name);
            setPhone(result.profile.phone);
            setNotice('Profil berhasil diperbarui.');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Profil tidak dapat diperbarui.');
        } finally {
            setIsSaving(false);
        }
    }

    return <div className="max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Akun & sistem</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Pengaturan</h1>
                <p className="mt-2 text-slate-500">Kelola informasi akun Anda dan lihat ringkasan aplikasi Tech Gate.</p>
            </div>
            {profile && <div className="hidden items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-600 sm:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-xs font-bold text-white">{initials(name || profile.email)}</span><span><span className="block font-bold text-[#0b2254]">Akun aktif</span><span className="text-xs">{roleLabel[profile.role] ?? profile.role}</span></span></div>}
        </div>
        {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
        {error && <section className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700"><p className="font-bold">Pengaturan tidak dapat diproses</p><p className="mt-1">{error}</p><button className="mt-3 font-bold underline" onClick={() => void load()} type="button">Muat ulang</button></section>}
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] xl:items-start">
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-7">
                {isLoading ? <p className="py-16 text-center text-sm text-slate-500">Memuat profil...</p> : profile && <>
                    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-50 to-slate-50 p-4 sm:p-5">
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-600/20">{initials(name || profile.email)}</span>
                        <div className="min-w-0"><h2 className="truncate text-xl font-bold text-[#0b2254]">{name || 'Profil akun'}</h2><p className="mt-0.5 truncate text-sm text-slate-500">{profile.email}</p><span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">{roleLabel[profile.role] ?? profile.role}</span></div>
                    </div>
                    <div className="mt-6 flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-[#0b2254]">Profil akun</h3><p className="mt-1 text-sm text-slate-500">Perbarui informasi kontak yang digunakan pada akun ini.</p></div></div>
                    <form className="mt-5" onSubmit={(event) => void save(event)}>
                        <div className="grid gap-5 sm:grid-cols-2">
                            <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Nama</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={isSaving} maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} /></label>
                            <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Nomor telepon <span className="font-medium text-slate-400">(opsional)</span></span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={isSaving} maxLength={25} onChange={(event) => setPhone(event.target.value)} pattern="[0-9+ ()-]{6,25}" type="tel" value={phone} /></label>
                            <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Email login</span><input className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500" disabled readOnly value={profile.email} /><span className="mt-2 block text-xs text-slate-500">Email dikelola oleh autentikasi dan tidak dapat diubah dari halaman ini.</span></label>
                        </div>
                        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Perubahan hanya berlaku untuk profil akun yang sedang digunakan.</p><button className="w-full shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto" disabled={isSaving} type="submit">{isSaving ? 'Menyimpan...' : 'Simpan perubahan'}</button></div>
                    </form>
                </>}
            </section>
            <div className="space-y-6">
                <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20">TG</span><div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Tentang aplikasi</p><h2 className="mt-1 text-xl font-bold text-[#0b2254]">Tech Gate</h2></div></div><p className="mt-5 text-sm leading-6 text-slate-500">Sistem Manajemen Toko dan Gudang untuk mendukung aktivitas operasional harian.</p><div className="mt-5 border-t border-slate-100 pt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Dibangun dengan</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">Next.js</span><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">TypeScript</span><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">Supabase</span></div></div></section>
                <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7"><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Akun Anda</p><h2 className="mt-2 text-xl font-bold text-[#0b2254]">Preferensi & keamanan</h2><div className="mt-5 divide-y divide-slate-100 text-sm"><div className="flex gap-3 py-4 first:pt-0"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm text-blue-700">☀</span><div><p className="font-bold text-slate-700">Tampilan</p><p className="mt-0.5 leading-5 text-slate-500">Tema terang sedang digunakan pada aplikasi.</p></div></div><div className="flex gap-3 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm text-slate-600">@</span><div><p className="font-bold text-slate-700">Email login</p><p className="mt-0.5 leading-5 text-slate-500">Dikelola oleh autentikasi dan tidak dapat diubah dari halaman ini.</p></div></div><div className="flex gap-3 pb-0 pt-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm text-blue-700">✓</span><div><p className="font-bold text-slate-700">Peran pengguna</p><p className="mt-0.5 leading-5 text-slate-500">{profile ? `${roleLabel[profile.role] ?? profile.role} dengan akses sesuai peran yang ditetapkan.` : 'Memuat informasi peran pengguna.'}</p></div></div></div></section>
            </div>
        </div>
    </div>;
}
