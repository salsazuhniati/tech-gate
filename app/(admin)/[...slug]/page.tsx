import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canAccessPath } from '../../../lib/auth/permissions';
import { getProfile } from '../../../lib/auth/profile';
import { createClient } from '../../../lib/supabase/server';
import { MasterDataPage } from '../../../components/master-data-page';
import { InventoryPage } from '../../../components/inventory-page';
import { SalesPage } from '../../../components/sales-page';
import { PurchaseOrdersPage } from '../../../components/purchase-orders-page';
import { FinancePage } from '../../../components/finance-page';
import { ReportsPage } from '../../../components/reports-page';
import { UsersPage } from '../../../components/users-page';
import { SettingsPage } from '../../../components/settings-page';

const pages: Record<string, { eyebrow: string; title: string; description: string }> = {
    products: {
        eyebrow: 'Inventori',
        title: 'Monitoring Produk',
        description: 'Pantau stok dan status seluruh produk di katalog.',
    },
    categories: { eyebrow: 'Master Data', title: 'Kategori', description: 'Kelola kategori produk toko Anda.' },
    suppliers: { eyebrow: 'Master Data', title: 'Supplier', description: 'Kelola data supplier toko Anda.' },
    customers: { eyebrow: 'Master Data', title: 'Pelanggan', description: 'Kelola data pelanggan toko Anda.' },
    inventory: { eyebrow: 'Operasional', title: 'Inventori', description: 'Pantau pergerakan inventori toko Anda.' },
    sales: { eyebrow: 'Operasional', title: 'Penjualan', description: 'Kelola aktivitas penjualan toko Anda.' },
    'purchase-orders': { eyebrow: 'Operasional', title: 'Purchase Order', description: 'Kelola pesanan pembelian toko Anda.' },
    finance: { eyebrow: 'Keuangan', title: 'Keuangan', description: 'Pantau data keuangan toko Anda.' },
    reports: { eyebrow: 'Analisis', title: 'Laporan', description: 'Tinjau laporan toko Anda.' },
    users: { eyebrow: 'Sistem', title: 'Pengguna', description: 'Kelola pengguna dan akses sistem.' },
    settings: { eyebrow: 'Sistem', title: 'Pengaturan', description: 'Sesuaikan pengaturan sistem.' },
};

export default async function PlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params;
    const page = pages[slug[0]];

    if (!page) {
        notFound();
    }

    const pathname = `/${slug.join('/')}`;
    const supabase = await createClient();
    const { data: claimsResult } = await supabase.auth.getClaims();
    const userId = claimsResult?.claims?.sub;
    const profile = typeof userId === 'string' ? await getProfile(supabase, userId) : null;

    if (!profile || !canAccessPath(profile.role, pathname)) {
        redirect('/dashboard');
    }

    if (slug.length === 1 && ['products', 'categories', 'suppliers', 'customers'].includes(slug[0])) {
        return <MasterDataPage module={slug[0] as 'products' | 'categories' | 'suppliers' | 'customers'} />;
    }

    if (slug[0] === 'products' && slug[1] === 'create' && slug.length === 2) {
        return <MasterDataPage module="products" createMode />;
    }

    if (slug[0] === 'inventory' && slug.length === 1) {
        return <InventoryPage />;
    }

    if (slug[0] === 'sales' && slug.length === 1) {
        return <SalesPage />;
    }

    if (slug[0] === 'purchase-orders' && slug.length === 1) {
        return <PurchaseOrdersPage />;
    }

    if (slug[0] === 'finance' && slug.length === 1) {
        return <FinancePage />;
    }

    if (slug[0] === 'reports' && slug.length === 1) {
        return <ReportsPage />;
    }

    if (slug[0] === 'users' && slug.length === 1) {
        return <UsersPage />;
    }

    if (slug[0] === 'settings' && slug.length === 1) {
        return <SettingsPage />;
    }

    const isProductEntry = slug[0] === 'products' && slug[1] === 'create';
    const title = isProductEntry ? 'Entri Produk Baru' : page.title;
    const description = isProductEntry ? 'Tambahkan produk agar dapat dipantau dalam inventori.' : page.description;

    return (
        <div className="max-w-3xl">
            {isProductEntry && (
                <Link className="text-sm font-bold text-blue-600" href="/products">
                    ← Kembali ke monitoring
                </Link>
            )}
            <p className={`${isProductEntry ? 'mt-4' : ''} text-sm font-bold uppercase tracking-[.16em] text-blue-600`}>{page.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">{title}</h1>
            <p className="mt-2 text-slate-500">{description}</p>
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
                <p className="text-sm text-slate-500">UI halaman ini disiapkan pada tahap migrasi berikutnya.</p>
            </section>
        </div>
    );
}
