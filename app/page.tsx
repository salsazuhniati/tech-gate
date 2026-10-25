import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '../components/brand-mark';
import { createClient } from '../lib/supabase/server';

export const dynamic = 'force-dynamic';

const capabilities = [
    {
        title: 'Produk & inventori',
        description: 'Kelola data produk dan pantau ketersediaan stok dengan lebih teratur.',
        icon: 'inventory',
    },
    {
        title: 'Operasional terpantau',
        description: 'Dukung aktivitas penjualan dan operasional harian dari satu sistem.',
        icon: 'monitoring',
    },
    {
        title: 'Akses sesuai peran',
        description: 'Admin, Staff, dan Manager bekerja dengan akses yang relevan.',
        icon: 'access',
    },
];

function FeatureIcon({ name }: { name: string }) {
    const paths = {
        inventory: <><path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Z" /><path d="m5 7.5 7 3.5 7-3.5M12 11v9" /></>,
        monitoring: <><path d="M4 19V5m0 14h16" /><path d="m7 15 3-3 3 2 5-6" /></>,
        access: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.7-3.3 3-5 6.5-5s5.8 1.7 6.5 5" /></>,
    };

    return (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
            {paths[name as keyof typeof paths]}
        </svg>
    );
}

function TechnologyIllustration() {
    return (
        <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute inset-8 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="absolute -right-5 top-8 h-20 w-20 rounded-full border border-cyan-200/30" />
            <div className="absolute -left-3 bottom-8 h-14 w-14 rounded-full border border-blue-200/20" />
            <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-[#0a367e]/70 p-3 shadow-2xl shadow-blue-950/30 backdrop-blur-sm">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(147,197,253,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(147,197,253,.24)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="relative rounded-xl border border-white/15 bg-[#082b68]/90 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.9)]" />
                            <span className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">Ilustrasi sistem</span>
                        </div>
                        <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-blue-100">Dashboard</span>
                    </div>
                    <div className="mt-5 grid grid-cols-[1.2fr_.8fr] gap-3">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="flex items-end gap-1.5 pt-5">
                                {[40, 68, 52, 82, 63, 92, 74].map((height, index) => (
                                    <span className="w-full rounded-t-sm bg-gradient-to-t from-blue-500 to-cyan-300/90" key={index} style={{ height }} />
                                ))}
                            </div>
                            <div className="mt-3 h-px bg-blue-200/20" />
                            <div className="mt-2 flex justify-between text-[9px] text-blue-200/70"><span>Stok</span><span>Aktivitas</span></div>
                        </div>
                        <div className="space-y-3">
                            <div className="rounded-lg border border-cyan-200/20 bg-cyan-300/10 p-3">
                                <div className="h-1.5 w-12 rounded-full bg-cyan-200/80" />
                                <div className="mt-3 h-1.5 w-full rounded-full bg-blue-100/15"><div className="h-full w-3/4 rounded-full bg-cyan-300" /></div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                <div className="h-1.5 w-10 rounded-full bg-blue-100/60" />
                                <div className="mt-3 flex gap-1"><span className="h-5 w-5 rounded bg-blue-400/70" /><span className="h-5 w-5 rounded bg-blue-300/40" /><span className="h-5 w-5 rounded bg-cyan-200/70" /></div>
                            </div>
                        </div>
                    </div>
                    <svg className="absolute -bottom-1 -right-1 h-28 w-36 text-cyan-200/40" fill="none" viewBox="0 0 144 112">
                        <path d="M0 94h38V58h31V20h75" stroke="currentColor" strokeWidth="1" />
                        <circle cx="38" cy="94" fill="currentColor" r="3" /><circle cx="69" cy="58" fill="currentColor" r="3" /><circle cx="69" cy="20" fill="currentColor" r="3" />
                    </svg>
                </div>
            </div>
        </div>
    );
}

export default async function HomePage() {
    let claims: { sub?: string } | undefined;

    try {
        const supabase = await createClient();
        const { data: claimsResult } = await supabase.auth.getClaims();
        claims = claimsResult?.claims;
    } catch {
        // Landing page remains available while Supabase environment values are not configured.
    }

    if (typeof claims?.sub === 'string') {
        redirect('/dashboard');
    }

    return (
        <main className="min-h-screen overflow-hidden bg-[#f6f9ff] text-[#0b2254]">
            <div className="relative isolate">
                <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-gradient-to-br from-[#071b47] via-[#0b3d9c] to-[#1768d6]" />
                <div className="absolute -right-28 top-20 -z-10 h-80 w-80 rounded-full bg-cyan-300/15 blur-3xl" />
                <div className="absolute -left-20 top-80 -z-10 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />

                <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
                    <BrandMark href="/" inverted />
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur-sm">
                        Sistem internal
                    </span>
                </header>

                <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.12fr_.88fr] lg:gap-12 lg:pb-28">
                    <div className="max-w-3xl">
                        <p className="text-sm font-bold uppercase tracking-[.2em] text-cyan-200">Tech Gate management system</p>
                        <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                            Kelola Tech Gate Lebih Mudah
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-8 text-blue-100 sm:text-lg">
                            Sistem internal untuk mengelola produk, stok, penjualan, dan operasional toko secara rapi dalam satu tempat.
                        </p>
                        <Link
                            className="mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3.5 font-bold text-blue-700 shadow-xl shadow-blue-950/20 transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-cyan-200/60"
                            href="/login"
                        >
                            Masuk ke Sistem
                            <span aria-hidden="true">→</span>
                        </Link>
                    </div>
                    <TechnologyIllustration />
                </section>
            </div>

            <section className="mx-auto -mt-8 max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
                <div className="grid gap-4 md:grid-cols-3">
                    {capabilities.map((capability) => (
                        <article className="rounded-2xl border border-blue-100 bg-white p-6 shadow-lg shadow-blue-950/5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10" key={capability.title}>
                            <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm shadow-blue-950/5">
                                <FeatureIcon name={capability.icon} />
                            </span>
                            <h2 className="mt-5 text-lg font-bold text-[#0b2254]">{capability.title}</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{capability.description}</p>
                        </article>
                    ))}
                </div>

                <div className="mt-12 rounded-2xl border border-blue-100 bg-blue-50/70 px-6 py-7 sm:flex sm:items-center sm:justify-between sm:px-8">
                    <div>
                        <p className="font-bold text-[#0b2254]">Informasi dan laporan yang siap ditindaklanjuti</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">Gunakan data operasional untuk membantu pengambilan keputusan toko.</p>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-blue-700 sm:mt-0">Khusus pengguna berwenang</p>
                </div>
            </section>
        </main>
    );
}
