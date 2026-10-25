import Link from 'next/link';
import { getProfile } from '../../../lib/auth/profile';
import { createClient } from '../../../lib/supabase/server';

type DashboardProduct = {
    id: string;
    name: string;
    sku: string;
    stock: number;
    minimum_stock: number;
    purchase_price: number | string;
    status: 'Aktif' | 'Nonaktif';
    unit: string;
    categories: { name: string } | null;
};

function formatRupiah(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);
}

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: claimsResult } = await supabase.auth.getClaims();
    const claims = claimsResult?.claims;
    const profilePromise = typeof claims?.sub === 'string' ? getProfile(supabase, claims.sub) : Promise.resolve(null);
    const [profile, productsResult] = await Promise.all([
        profilePromise,
        supabase
            .from('products')
            .select('id, name, sku, stock, minimum_stock, purchase_price, status, unit, categories(name)')
            .order('created_at', { ascending: false }),
    ]);
    const userName = profile?.name || (typeof claims?.email === 'string' ? claims.email : 'Pengguna Tech Gate');

    if (productsResult.error) {
        return (
            <>
                <DashboardGreeting userName={userName} />
                <section className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-700">
                    Statistik dashboard tidak dapat dimuat. Periksa koneksi, sesi login, atau kebijakan akses Supabase lalu muat ulang halaman.
                </section>
            </>
        );
    }

    const products = (productsResult.data ?? []) as unknown as DashboardProduct[];
    const totalStockValue = products.reduce((total, product) => total + product.stock * Number(product.purchase_price), 0);
    const lowStockCount = products.filter((product) => product.status === 'Aktif' && product.stock <= product.minimum_stock).length;
    const statistics = [
        { label: 'Total Barang', value: products.length.toLocaleString('id-ID'), badge: 'Produk tercatat', badgeClass: 'bg-blue-50 text-blue-600' },
        { label: 'Stok Menipis', value: lowStockCount.toLocaleString('id-ID'), badge: 'Produk aktif', badgeClass: 'bg-amber-50 text-amber-700' },
        { label: 'Total Nilai Stok', value: formatRupiah(totalStockValue), badge: 'Berdasarkan harga beli', badgeClass: 'bg-cyan-50 text-cyan-700' },
    ];

    return (
        <>
            <DashboardGreeting userName={userName} />

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
                {statistics.map((statistic) => (
                    <div key={statistic.label} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                        <p className="text-sm font-semibold text-slate-500">{statistic.label}</p>
                        <p className="mt-3 text-3xl font-bold text-[#0b2254]">{statistic.value}</p>
                        <span className={'mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-bold ' + statistic.badgeClass}>{statistic.badge}</span>
                    </div>
                ))}
            </div>

            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-[#0b2254]">Produk terbaru</h2>
                        <p className="mt-1 text-sm text-slate-500">Data terakhir yang masuk ke katalog.</p>
                    </div>
                    <Link href="/products" className="text-sm font-bold text-blue-600">
                        Lihat monitoring →
                    </Link>
                </div>
                <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-130 text-left text-sm">
                        <thead className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="pb-3 font-semibold">Produk</th>
                                <th className="pb-3 font-semibold">Kategori</th>
                                <th className="pb-3 font-semibold">Stok</th>
                                <th className="pb-3 font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {products.slice(0, 5).map((product) => (
                                <tr key={product.id}>
                                    <td className="py-4 font-bold text-[#0b2254]">
                                        {product.name}<span className="ml-2 text-xs font-medium text-slate-400">{product.sku}</span>
                                    </td>
                                    <td className="py-4 text-slate-600">{product.categories?.name ?? '—'}</td>
                                    <td className="py-4 text-slate-600">{product.stock} {product.unit}</td>
                                    <td className="py-4">
                                        <span className={product.status === 'Aktif' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'}>
                                            {product.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {products.length === 0 && (
                                <tr>
                                    <td className="py-8 text-center text-slate-500" colSpan={4}>Belum ada produk untuk ditampilkan.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}

function DashboardGreeting({ userName }: { userName: string }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Ringkasan hari ini</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Halo, {userName}! </h1>
                <p className="mt-2 text-slate-500">Berikut kondisi inventori toko Anda saat ini.</p>
            </div>
            <Link href="/products/create" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">
                + Entri Produk
            </Link>
        </div>
    );
}
