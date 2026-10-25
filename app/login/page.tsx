import { redirect } from 'next/navigation';
import { BrandMark } from '../../components/brand-mark';
import { LoginForm } from '../../components/login-form';
import { createClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
    let claims: { sub?: string } | undefined;

    try {
        const supabase = await createClient();
        const { data: claimsResult } = await supabase.auth.getClaims();
        claims = claimsResult?.claims;
    } catch {
        // Keep the existing login UI available until Supabase environment values are configured.
    }

    if (typeof claims?.sub === 'string') {
        redirect('/dashboard');
    }

    return (
        <main className="grid min-h-screen bg-[#f7faff] lg:grid-cols-2">
            <section className="hidden bg-[#071b47] p-14 lg:flex lg:flex-col lg:justify-between">
                <BrandMark href="/" inverted />
                <div>
                    <p className="text-sm font-bold uppercase tracking-[.18em] text-cyan-300">Admin portal</p>
                    <h1 className="mt-4 max-w-md text-5xl font-bold leading-tight text-white">Kelola teknologi dengan lebih sederhana.</h1>
                    <p className="mt-5 max-w-md leading-7 text-blue-200">
                        Pantau produk, kelola inventori, dan bantu pelanggan dari satu tempat.
                    </p>
                </div>
                <p className="text-sm text-blue-300">© {new Date().getFullYear()} Tech Gate</p>
            </section>
            <section className="flex items-center justify-center px-5 py-12">
                <div className="w-full max-w-md">
                    <div className="mb-12 lg:hidden">
                        <BrandMark href="/" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Selamat datang kembali</p>
                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#0b2254]">Masuk ke panel</h1>
                    <p className="mt-3 text-slate-500">Gunakan akun yang diberikan oleh administrator.</p>
                    <LoginForm />
                </div>
            </section>
        </main>
    );
}
