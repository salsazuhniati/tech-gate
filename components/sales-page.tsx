'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type Product = {
    id: string;
    name: string;
    sku: string;
    stock: number;
    selling_price: number | string;
    unit: string;
};

type Customer = { id: string; name: string };
type SaleItem = { id: string; quantity: number };
type Sale = {
    id: string;
    transaction_number: string;
    status: 'completed' | 'cancelled';
    subtotal: number | string;
    total: number | string;
    notes: string | null;
    created_at: string;
    customers: { name: string } | null;
    sale_items: SaleItem[];
};
type DraftItem = { productId: string; quantity: number };
type FinalizedSale = { sale_id: string; transaction_number: string };
type SaleRequestPayload = {
    requestId: string;
    customerId: string;
    notes: string;
    items: DraftItem[];
    ownerId: string;
};

const pendingSaleStorageKey = 'techgate.pending-sale-v1';

const formatRupiah = (value: number | string) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(value));

const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

function createRequestId() {
    return crypto.randomUUID();
}

function messageFrom(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function isKnownDatabaseError(error: unknown): error is { code: string; message: string } {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || /^PGRST[0-9A-Z]+$/.test(code));
}

function isSaleRequestPayload(value: unknown): value is SaleRequestPayload {
    if (typeof value !== 'object' || value === null) return false;
    const payload = value as Partial<SaleRequestPayload>;
    return typeof payload.requestId === 'string'
        && typeof payload.customerId === 'string'
        && typeof payload.notes === 'string'
        && typeof payload.ownerId === 'string'
        && Array.isArray(payload.items)
        && payload.items.every((item) => typeof item === 'object' && item !== null && typeof item.productId === 'string' && typeof item.quantity === 'number');
}

export function SalesPage() {
    const [sales, setSales] = useState<Sale[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<DraftItem[]>([]);
    const [requestId, setRequestId] = useState(() => createRequestId());
    const [pendingAttempt, setPendingAttempt] = useState<SaleRequestPayload | null>(null);

    async function loadData() {
        setLoading(true);
        try {
            const supabase = createClient();
            const [salesResult, productsResult, customersResult] = await Promise.all([
                supabase.from('sales').select('id, transaction_number, status, subtotal, total, notes, created_at, customers(name), sale_items(id, quantity)').order('created_at', { ascending: false }).limit(100),
                supabase.from('products').select('id, name, sku, stock, selling_price, unit').eq('status', 'Aktif').order('name'),
                supabase.from('customers').select('id, name').order('name'),
            ]);
            if (salesResult.error) throw salesResult.error;
            if (productsResult.error) throw productsResult.error;
            if (customersResult.error) throw customersResult.error;
            setSales((salesResult.data ?? []) as unknown as Sale[]);
            setProducts((productsResult.data ?? []) as Product[]);
            setCustomers((customersResult.data ?? []) as Customer[]);
        } catch (caughtError) {
            setError(messageFrom(caughtError, 'Data penjualan belum dapat dimuat. Pastikan migration Penjualan sudah diterapkan dan akses Anda tersedia.'));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void loadData(); }, []);

    useEffect(() => {
        async function restorePendingAttempt() {
            try {
                const raw = window.localStorage.getItem(pendingSaleStorageKey);
                if (!raw) return;
                const saved = JSON.parse(raw) as unknown;
                if (!isSaleRequestPayload(saved)) {
                    window.localStorage.removeItem(pendingSaleStorageKey);
                    return;
                }

                const supabase = createClient();
                const { data: userResult } = await supabase.auth.getUser();
                if (userResult.user?.id !== saved.ownerId) return;

                const { data: lookupData, error: lookupError } = await supabase.rpc('get_sale_by_idempotency_key', {
                    p_idempotency_key: saved.requestId,
                });
                const completed = (Array.isArray(lookupData) ? lookupData[0] : lookupData) as FinalizedSale | null;
                if (!lookupError && completed?.sale_id && completed.transaction_number) {
                    window.localStorage.removeItem(pendingSaleStorageKey);
                    setNotice(`Transaksi ${completed.transaction_number} sebelumnya telah tersimpan.`);
                    await loadData();
                    return;
                }

                setRequestId(saved.requestId);
                setCustomerId(saved.customerId);
                setNotes(saved.notes);
                setItems(saved.items);
                setPendingAttempt(saved);
                setShowForm(true);
                setError('Hasil transaksi sebelumnya belum dapat dipastikan. Periksa atau coba ulang dengan payload yang sama.');
            } catch {
                // Data browser yang rusak tidak boleh mencegah halaman Penjualan dibuka.
            }
        }

        void restorePendingAttempt();
    }, []);

    const filteredSales = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return sales;
        return sales.filter((sale) => sale.transaction_number.toLowerCase().includes(term) || sale.customers?.name.toLowerCase().includes(term));
    }, [sales, search]);

    const detailedItems = useMemo(() => items.map((item) => ({
        ...item,
        product: products.find((product) => product.id === item.productId) ?? null,
    })), [items, products]);

    const draftTotal = detailedItems.reduce((total, item) => total + (item.product ? Number(item.product.selling_price) * item.quantity : 0), 0);
    const hasDraft = Boolean(customerId || notes.trim() || items.length > 0);
    const formLocked = submitting || Boolean(pendingAttempt);

    function openForm() {
        if (pendingAttempt) {
            setShowForm(true);
            setError('Selesaikan atau coba ulang transaksi sebelumnya terlebih dahulu.');
            return;
        }
        setError(null);
        setNotice(null);
        setCustomerId('');
        setNotes('');
        setItems([]);
        setRequestId(createRequestId());
        setShowForm(true);
    }

    function closeForm() {
        if (submitting) return;
        if (pendingAttempt) {
            setError('Hasil transaksi belum pasti. Gunakan Coba ulang untuk mengirim payload yang sama.');
            return;
        }
        if (hasDraft && !window.confirm('Batalkan transaksi ini? Data yang belum disimpan akan hilang.')) return;
        setShowForm(false);
    }

    function addItem() {
        if (pendingAttempt) return;
        const available = products.find((product) => !items.some((item) => item.productId === product.id));
        if (!available) {
            setError('Semua produk aktif sudah ditambahkan ke transaksi.');
            return;
        }
        setError(null);
        setItems((current) => [...current, { productId: available.id, quantity: 1 }]);
    }

    function updateItem(index: number, change: Partial<DraftItem>) {
        if (pendingAttempt) return;
        setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
    }

    function removeItem(index: number) {
        if (pendingAttempt) return;
        setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }

    function preserveUncertainAttempt(payload: SaleRequestPayload, errorMessage: string) {
        window.localStorage.setItem(pendingSaleStorageKey, JSON.stringify(payload));
        setPendingAttempt(payload);
        setError(errorMessage);
    }

    function clearUncertainAttempt() {
        window.localStorage.removeItem(pendingSaleStorageKey);
        setPendingAttempt(null);
    }

    async function submitSale(payload: SaleRequestPayload) {
        setSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            const { data, error: rpcError } = await createClient().rpc('finalize_sale', {
                p_customer_id: payload.customerId || null,
                p_items: payload.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
                p_notes: payload.notes.trim() || null,
                p_idempotency_key: payload.requestId,
            });
            if (rpcError) throw rpcError;
            const result = (Array.isArray(data) ? data[0] : data) as FinalizedSale | null;
            if (!result?.sale_id || !result.transaction_number) throw new Error('Respons transaksi dari server tidak valid.');

            clearUncertainAttempt();
            setShowForm(false);
            setNotice(`Transaksi ${result.transaction_number} berhasil disimpan.`);
            await loadData();
        } catch (caughtError) {
            if (isKnownDatabaseError(caughtError)) {
                clearUncertainAttempt();
                setError(messageFrom(caughtError, 'Transaksi ditolak oleh server. Perbaiki data lalu coba lagi.'));
            } else {
                preserveUncertainAttempt(payload, 'Hasil transaksi belum dapat dipastikan. Payload dikunci; gunakan Coba ulang untuk mengirim request yang sama.');
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function finalizeSale() {
        setError(null);
        setNotice(null);
        if (pendingAttempt) {
            setError('Gunakan Coba ulang untuk transaksi yang hasilnya belum pasti.');
            return;
        }
        if (items.length === 0) {
            setError('Tambahkan minimal satu produk ke transaksi.');
            return;
        }
        if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
            setError('Pilih produk dan isi kuantitas berupa bilangan bulat lebih besar dari nol.');
            return;
        }
        if (new Set(items.map((item) => item.productId)).size !== items.length) {
            setError('Satu produk hanya dapat ditambahkan sekali dalam satu transaksi.');
            return;
        }

        try {
            const supabase = createClient();
            const { data: userResult, error: userError } = await supabase.auth.getUser();
            if (userError || !userResult.user) throw userError ?? new Error('Sesi pengguna tidak tersedia.');
            await submitSale({
                requestId,
                customerId,
                notes,
                items: items.map((item) => ({ ...item })),
                ownerId: userResult.user.id,
            });
        } catch (caughtError) {
            setError(messageFrom(caughtError, 'Sesi tidak dapat diverifikasi. Periksa koneksi lalu coba lagi.'));
        }
    }

    async function retryPendingSale() {
        if (!pendingAttempt) return;
        await submitSale(pendingAttempt);
    }

    return (
        <div className="max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Operasional</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Penjualan</h1><p className="mt-2 text-slate-500">Catat transaksi penjualan dan pantau riwayatnya.</p></div>
                <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={Boolean(pendingAttempt)} onClick={openForm} type="button">+ Transaksi baru</button>
            </div>

            {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
            {error && !showForm && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

            <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-bold text-[#0b2254]">Daftar transaksi</h2><p className="mt-1 text-sm text-slate-500">Menampilkan maksimal 100 transaksi terbaru.</p></div><input aria-label="Cari transaksi" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-72" onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor atau pelanggan" value={search} /></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 sm:px-6">Transaksi</th><th className="px-5 py-3">Pelanggan</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 sm:px-6">Waktu</th></tr></thead><tbody className="divide-y divide-slate-100">
                    {loading && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={6}>Memuat transaksi...</td></tr>}
                    {!loading && filteredSales.map((sale) => <tr key={sale.id}><td className="px-5 py-4 font-bold text-[#0b2254] sm:px-6">{sale.transaction_number}</td><td className="px-5 py-4 text-slate-600">{sale.customers?.name ?? 'Umum'}</td><td className="px-5 py-4 text-slate-600">{sale.sale_items?.length ?? 0} produk</td><td className="px-5 py-4 font-bold text-slate-700">{formatRupiah(sale.total)}</td><td className="px-5 py-4"><span className={sale.status === 'completed' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'}>{sale.status === 'completed' ? 'Selesai' : 'Dibatalkan'}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-600 sm:px-6">{formatDate(sale.created_at)}</td></tr>)}
                    {!loading && filteredSales.length === 0 && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={6}>{sales.length === 0 ? 'Belum ada transaksi penjualan.' : 'Tidak ada transaksi yang sesuai pencarian.'}</td></tr>}
                </tbody></table></div>
            </section>

            {showForm && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-5" role="dialog" aria-label="Transaksi penjualan baru" aria-modal="true"><div className="mx-auto my-6 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#0b2254]">Transaksi penjualan baru</h2><p className="mt-1 text-sm text-slate-500">Harga dan total akhir akan dihitung ulang oleh sistem saat disimpan.</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={formLocked} onClick={closeForm} type="button">Tutup</button></div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Pelanggan <span className="font-medium text-slate-400">(opsional)</span></span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} onChange={(event) => setCustomerId(event.target.value)} value={customerId}><option value="">Pelanggan umum</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Catatan <span className="font-medium text-slate-400">(opsional)</span></span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} maxLength={500} onChange={(event) => setNotes(event.target.value)} value={notes} /></label></div>
                <div className="mt-7"><div className="flex items-center justify-between"><h3 className="font-bold text-[#0b2254]">Item penjualan</h3><button className="text-sm font-bold text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400" disabled={formLocked || products.length === 0} onClick={addItem} type="button">+ Tambah produk</button></div>{products.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-700">Belum ada produk aktif yang dapat dijual.</p>}
                    <div className="mt-3 space-y-3">{detailedItems.map((item, index) => <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] sm:items-end" key={index}><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Produk</span><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500" disabled={formLocked} onChange={(event) => updateItem(index, { productId: event.target.value })} value={item.productId}><option value="">Pilih produk</option>{products.map((product) => <option disabled={items.some((other, otherIndex) => otherIndex !== index && other.productId === product.id)} key={product.id} value={product.id}>{product.name} ({product.stock} {product.unit})</option>)}</select></label><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Kuantitas</span><input className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" disabled={formLocked} max="2147483647" min="1" onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} step="1" type="number" value={item.quantity} /></label><div><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Subtotal</span><p className="py-2.5 font-bold text-slate-700">{formatRupiah(item.product ? Number(item.product.selling_price) * item.quantity : 0)}</p></div><button className="rounded-lg px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50" disabled={formLocked} onClick={() => removeItem(index)} type="button">Hapus</button></div>)}</div></div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5"><p className="text-sm text-slate-500">{items.length} produk dipilih</p><p className="text-xl font-bold text-[#0b2254]">Total: {formatRupiah(draftTotal)}</p></div>
                {pendingAttempt && <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Respons sebelumnya belum diterima. Data dikunci untuk mencegah transaksi ganda; coba ulang akan memakai nomor request yang sama.</p>}
                {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
                <div className="mt-7 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={formLocked} onClick={closeForm} type="button">Batal</button>{pendingAttempt ? <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={submitting} onClick={() => void retryPendingSale()} type="button">{submitting ? 'Memeriksa...' : 'Coba ulang transaksi'}</button> : <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={submitting || items.length === 0} onClick={() => void finalizeSale()} type="button">{submitting ? 'Menyimpan...' : 'Simpan transaksi'}</button>}</div>
            </div></div>}
        </div>
    );
}
