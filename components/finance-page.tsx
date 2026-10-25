'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type TransactionType = 'cash_in' | 'cash_out';
type ReferenceType = 'none' | 'sale' | 'purchase_order';
type OperationalReference = { transaction_number?: string; order_number?: string };
type FinanceTransaction = {
    id: string;
    transaction_type: TransactionType;
    category: string;
    amount: number | string;
    transaction_date: string;
    payment_method: string;
    description: string | null;
    sale_id: string | null;
    purchase_order_id: string | null;
    created_at: string;
    sales: OperationalReference | OperationalReference[] | null;
    purchase_orders: OperationalReference | OperationalReference[] | null;
};
type CashSummary = {
    cash_in: number | string;
    cash_out: number | string;
    net_cash_flow: number | string;
    transaction_count: number | string;
};
type SaleOption = { id: string; transaction_number: string; created_at: string };
type PurchaseOrderOption = { id: string; order_number: string; status: string; order_date: string };
type FinanceRequestPayload = {
    requestId: string;
    ownerId: string;
    transactionType: TransactionType;
    category: string;
    amount: number;
    transactionDate: string;
    paymentMethod: string;
    description: string;
    referenceType: ReferenceType;
    referenceId: string;
};

const pendingFinanceStorageKey = 'techgate.pending-finance-transaction-v1';
const emptySummary: CashSummary = { cash_in: 0, cash_out: 0, net_cash_flow: 0, transaction_count: 0 };

const formatRupiah = (value: number | string) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 2,
}).format(Number(value));

const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));

function dateInputValue(value: Date) {
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function initialStartDate() {
    const today = new Date();
    return dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
}

function firstRelation(value: OperationalReference | OperationalReference[] | null) {
    return Array.isArray(value) ? value[0] ?? null : value;
}

function isKnownDatabaseError(error: unknown): error is { code: string } {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || /^PGRST[0-9A-Z]+$/.test(code));
}

function isFinanceRequestPayload(value: unknown): value is FinanceRequestPayload {
    if (typeof value !== 'object' || value === null) return false;
    const payload = value as Partial<FinanceRequestPayload>;
    return typeof payload.requestId === 'string'
        && typeof payload.ownerId === 'string'
        && (payload.transactionType === 'cash_in' || payload.transactionType === 'cash_out')
        && typeof payload.category === 'string'
        && typeof payload.amount === 'number'
        && typeof payload.transactionDate === 'string'
        && typeof payload.paymentMethod === 'string'
        && typeof payload.description === 'string'
        && ['none', 'sale', 'purchase_order'].includes(payload.referenceType ?? '')
        && typeof payload.referenceId === 'string';
}

export function FinancePage() {
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [summary, setSummary] = useState<CashSummary>(emptySummary);
    const [sales, setSales] = useState<SaleOption[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [endDate, setEndDate] = useState(() => dateInputValue(new Date()));
    const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [referenceLoading, setReferenceLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [transactionType, setTransactionType] = useState<TransactionType>('cash_in');
    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState('');
    const [transactionDate, setTransactionDate] = useState(() => dateInputValue(new Date()));
    const [paymentMethod, setPaymentMethod] = useState('');
    const [description, setDescription] = useState('');
    const [referenceType, setReferenceType] = useState<ReferenceType>('none');
    const [referenceId, setReferenceId] = useState('');
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const [pendingAttempt, setPendingAttempt] = useState<FinanceRequestPayload | null>(null);

    async function loadData() {
        if (!startDate || !endDate || startDate > endDate) {
            setLoading(false);
            setError('Tanggal mulai tidak boleh melebihi tanggal akhir.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const supabase = createClient();
            const [transactionsResult, summaryResult] = await Promise.all([
                supabase
                    .from('finance_transactions')
                    .select('id, transaction_type, category, amount, transaction_date, payment_method, description, sale_id, purchase_order_id, created_at, sales(transaction_number), purchase_orders(order_number)')
                    .gte('transaction_date', startDate)
                    .lte('transaction_date', endDate)
                    .order('transaction_date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(100),
                supabase.rpc('get_finance_cash_summary', { p_start_date: startDate, p_end_date: endDate }),
            ]);

            if (transactionsResult.error) throw transactionsResult.error;
            if (summaryResult.error) throw summaryResult.error;

            const nextSummary = (Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data) as CashSummary | null;
            setTransactions((transactionsResult.data ?? []) as unknown as FinanceTransaction[]);
            setSummary(nextSummary ?? emptySummary);
        } catch (caughtError) {
            setTransactions([]);
            setSummary(emptySummary);
            setError(isKnownDatabaseError(caughtError) && (caughtError as { code: string }).code === '42501'
                ? 'Anda tidak memiliki akses ke data Keuangan.'
                : 'Data Keuangan belum dapat dimuat. Periksa koneksi atau hak akses Anda lalu coba lagi.');
        } finally {
            setLoading(false);
        }
    }

    async function loadReferences() {
        if (sales.length > 0 || purchaseOrders.length > 0 || referenceLoading) return;
        setReferenceLoading(true);
        try {
            const supabase = createClient();
            const [salesResult, purchaseOrdersResult] = await Promise.all([
                supabase.from('sales').select('id, transaction_number, created_at').order('created_at', { ascending: false }).limit(100),
                supabase.from('purchase_orders').select('id, order_number, status, order_date').order('created_at', { ascending: false }).limit(100),
            ]);
            if (salesResult.error) throw salesResult.error;
            if (purchaseOrdersResult.error) throw purchaseOrdersResult.error;
            setSales((salesResult.data ?? []) as SaleOption[]);
            setPurchaseOrders((purchaseOrdersResult.data ?? []) as PurchaseOrderOption[]);
        } catch {
            setError('Referensi operasional belum dapat dimuat. Anda tetap dapat mencatat transaksi tanpa referensi.');
        } finally {
            setReferenceLoading(false);
        }
    }

    useEffect(() => { void loadData(); }, [startDate, endDate]);

    useEffect(() => {
        async function restorePendingAttempt() {
            try {
                const raw = window.localStorage.getItem(pendingFinanceStorageKey);
                if (!raw) return;
                const saved = JSON.parse(raw) as unknown;
                if (!isFinanceRequestPayload(saved)) {
                    window.localStorage.removeItem(pendingFinanceStorageKey);
                    return;
                }

                const { data: userResult } = await createClient().auth.getUser();
                if (userResult.user?.id !== saved.ownerId) return;

                setRequestId(saved.requestId);
                setTransactionType(saved.transactionType);
                setCategory(saved.category);
                setAmount(String(saved.amount));
                setTransactionDate(saved.transactionDate);
                setPaymentMethod(saved.paymentMethod);
                setDescription(saved.description);
                setReferenceType(saved.referenceType);
                setReferenceId(saved.referenceId);
                setPendingAttempt(saved);
                setShowForm(true);
                setError('Hasil transaksi sebelumnya belum dapat dipastikan. Gunakan Coba ulang dengan data yang sama.');
                if (saved.referenceType !== 'none') await loadReferences();
            } catch {
                // Data browser yang rusak tidak boleh menghalangi halaman Keuangan dibuka.
            }
        }

        void restorePendingAttempt();
    }, []);

    const filteredTransactions = useMemo(() => {
        const term = search.trim().toLowerCase();
        return transactions.filter((transaction) => {
            if (typeFilter !== 'all' && transaction.transaction_type !== typeFilter) return false;
            if (!term) return true;
            const sale = firstRelation(transaction.sales)?.transaction_number ?? '';
            const purchaseOrder = firstRelation(transaction.purchase_orders)?.order_number ?? '';
            return [transaction.category, transaction.description ?? '', transaction.payment_method, sale, purchaseOrder]
                .some((value) => value.toLowerCase().includes(term));
        });
    }, [search, transactions, typeFilter]);

    const hasDraft = Boolean(category.trim() || amount || paymentMethod.trim() || description.trim() || referenceId);
    const formLocked = submitting || Boolean(pendingAttempt);

    function resetForm() {
        setTransactionType('cash_in');
        setCategory('');
        setAmount('');
        setTransactionDate(dateInputValue(new Date()));
        setPaymentMethod('');
        setDescription('');
        setReferenceType('none');
        setReferenceId('');
        setRequestId(crypto.randomUUID());
    }

    function openForm() {
        setNotice(null);
        setError(null);
        if (pendingAttempt) {
            setShowForm(true);
            setError('Selesaikan atau coba ulang transaksi sebelumnya terlebih dahulu.');
            return;
        }
        resetForm();
        setShowForm(true);
        void loadReferences();
    }

    function closeForm() {
        if (submitting) return;
        if (pendingAttempt) {
            setError('Hasil transaksi belum pasti. Gunakan Coba ulang dengan data yang sama.');
            return;
        }
        if (hasDraft && !window.confirm('Batalkan transaksi ini? Data yang belum disimpan akan hilang.')) return;
        setShowForm(false);
        resetForm();
        setError(null);
    }

    function preserveUncertainAttempt(payload: FinanceRequestPayload) {
        window.localStorage.setItem(pendingFinanceStorageKey, JSON.stringify(payload));
        setPendingAttempt(payload);
        setError('Hasil transaksi belum dapat dipastikan. Data dikunci untuk mencegah transaksi ganda; gunakan Coba ulang dengan request yang sama.');
    }

    function clearUncertainAttempt() {
        window.localStorage.removeItem(pendingFinanceStorageKey);
        setPendingAttempt(null);
    }

    async function submitTransaction(payload: FinanceRequestPayload) {
        setSubmitting(true);
        setError(null);
        setNotice(null);
        try {
            const { data, error: rpcError } = await createClient().rpc('record_finance_transaction', {
                p_transaction_type: payload.transactionType,
                p_category: payload.category,
                p_amount: payload.amount,
                p_transaction_date: payload.transactionDate,
                p_payment_method: payload.paymentMethod,
                p_description: payload.description || null,
                p_sale_id: payload.referenceType === 'sale' ? payload.referenceId : null,
                p_purchase_order_id: payload.referenceType === 'purchase_order' ? payload.referenceId : null,
                p_idempotency_key: payload.requestId,
            });
            if (rpcError) throw rpcError;
            if (!data) throw new Error('Respons transaksi dari server tidak valid.');

            clearUncertainAttempt();
            setShowForm(false);
            resetForm();
            setNotice('Transaksi keuangan berhasil dicatat.');
            await loadData();
        } catch (caughtError) {
            if (isKnownDatabaseError(caughtError)) {
                clearUncertainAttempt();
                setError((caughtError as { code: string }).code === '42501'
                    ? 'Anda tidak memiliki akses untuk mencatat transaksi Keuangan.'
                    : 'Transaksi ditolak oleh sistem. Periksa data lalu coba lagi.');
            } else {
                preserveUncertainAttempt(payload);
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function saveTransaction() {
        setError(null);
        setNotice(null);
        if (pendingAttempt) {
            setError('Gunakan Coba ulang untuk transaksi yang hasilnya belum pasti.');
            return;
        }

        const normalizedCategory = category.trim();
        const normalizedPaymentMethod = paymentMethod.trim();
        const normalizedDescription = description.trim();
        const amountPattern = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;
        const parsedAmount = Number(amount);
        if (!normalizedCategory || normalizedCategory.length > 100) {
            setError('Kategori wajib diisi dengan maksimal 100 karakter.');
            return;
        }
        if (!amountPattern.test(amount) || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 999999999999.99) {
            setError('Nominal harus positif dengan maksimal dua angka desimal.');
            return;
        }
        if (!transactionDate) {
            setError('Tanggal transaksi wajib diisi.');
            return;
        }
        if (!normalizedPaymentMethod || normalizedPaymentMethod.length > 50) {
            setError('Metode pembayaran wajib diisi dengan maksimal 50 karakter.');
            return;
        }
        if (normalizedDescription.length > 500) {
            setError('Keterangan maksimal 500 karakter.');
            return;
        }
        if (referenceType !== 'none' && !referenceId) {
            setError('Pilih referensi operasional atau pilih tanpa referensi.');
            return;
        }

        try {
            const { data: userResult, error: userError } = await createClient().auth.getUser();
            if (userError || !userResult.user) throw userError ?? new Error('Sesi pengguna tidak tersedia.');
            await submitTransaction({
                requestId,
                ownerId: userResult.user.id,
                transactionType,
                category: normalizedCategory,
                amount: parsedAmount,
                transactionDate,
                paymentMethod: normalizedPaymentMethod,
                description: normalizedDescription,
                referenceType,
                referenceId: referenceType === 'none' ? '' : referenceId,
            });
        } catch {
            setError('Sesi tidak dapat diverifikasi. Periksa koneksi lalu coba lagi.');
        }
    }

    async function retryPendingTransaction() {
        if (pendingAttempt) await submitTransaction(pendingAttempt);
    }

    return (
        <div className="max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Keuangan</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Keuangan</h1><p className="mt-2 text-slate-500">Catat arus kas yang benar-benar terjadi dan pantau ringkasannya.</p></div>
                <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={Boolean(pendingAttempt)} onClick={openForm} type="button">+ Tambah Transaksi</button>
            </div>

            {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
            {error && !showForm && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

            <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
                <div className="flex flex-wrap items-end gap-4"><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tanggal mulai</span><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" max={endDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tanggal akhir</span><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label><button className="rounded-xl px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50" onClick={() => void loadData()} type="button">Muat ulang</button></div>
            </section>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Kas Masuk" value={formatRupiah(summary.cash_in)} valueClass="text-emerald-700" />
                <SummaryCard label="Kas Keluar" value={formatRupiah(summary.cash_out)} valueClass="text-rose-700" />
                <SummaryCard label="Arus Kas Bersih" value={formatRupiah(summary.net_cash_flow)} valueClass={Number(summary.net_cash_flow) >= 0 ? 'text-blue-700' : 'text-rose-700'} />
                <SummaryCard label="Jumlah Transaksi" value={Number(summary.transaction_count).toLocaleString('id-ID')} valueClass="text-[#0b2254]" />
            </div>

            <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-bold text-[#0b2254]">Daftar transaksi kas</h2><p className="mt-1 text-sm text-slate-500">Menampilkan maksimal 100 transaksi pada periode yang dipilih.</p></div><div className="flex w-full flex-wrap gap-3 sm:w-auto"><select aria-label="Filter jenis transaksi" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setTypeFilter(event.target.value as 'all' | TransactionType)} value={typeFilter}><option value="all">Semua jenis</option><option value="cash_in">Kas masuk</option><option value="cash_out">Kas keluar</option></select><input aria-label="Cari transaksi kas" className="min-w-52 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" onChange={(event) => setSearch(event.target.value)} placeholder="Cari kategori atau referensi" value={search} /></div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[64rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 sm:px-6">Tanggal</th><th className="px-5 py-3">Jenis</th><th className="px-5 py-3">Kategori</th><th className="px-5 py-3">Keterangan</th><th className="px-5 py-3">Metode</th><th className="px-5 py-3">Referensi</th><th className="px-5 py-3 text-right sm:px-6">Nominal</th></tr></thead><tbody className="divide-y divide-slate-100">
                    {loading && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={7}>Memuat transaksi Keuangan...</td></tr>}
                    {!loading && filteredTransactions.map((transaction) => <FinanceRow key={transaction.id} transaction={transaction} />)}
                    {!loading && filteredTransactions.length === 0 && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={7}>{transactions.length === 0 ? 'Belum ada transaksi pada periode ini.' : 'Tidak ada transaksi yang sesuai filter.'}</td></tr>}
                </tbody></table></div>
            </section>

            {showForm && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-5" role="dialog" aria-label="Tambah transaksi keuangan" aria-modal="true"><div className="mx-auto my-6 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#0b2254]">Tambah transaksi</h2><p className="mt-1 text-sm text-slate-500">Catat hanya kas yang benar-benar masuk atau keluar.</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={formLocked} onClick={closeForm} type="button">Tutup</button></div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Jenis transaksi</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} onChange={(event) => setTransactionType(event.target.value as TransactionType)} value={transactionType}><option value="cash_in">Kas Masuk</option><option value="cash_out">Kas Keluar</option></select></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tanggal transaksi</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} onChange={(event) => setTransactionDate(event.target.value)} required type="date" value={transactionDate} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Kategori</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} maxLength={100} onChange={(event) => setCategory(event.target.value)} required value={category} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Nominal (Rp)</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} inputMode="decimal" max="999999999999.99" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="Contoh: 150000" required step="0.01" type="number" value={amount} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Metode pembayaran</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} maxLength={50} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="Contoh: Tunai atau Transfer" required value={paymentMethod} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Jenis referensi <span className="font-medium text-slate-400">(opsional)</span></span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked || referenceLoading} onChange={(event) => { const nextType = event.target.value as ReferenceType; setReferenceType(nextType); setReferenceId(''); if (nextType !== 'none') void loadReferences(); }} value={referenceType}><option value="none">Tanpa referensi</option><option value="sale">Penjualan</option><option value="purchase_order">Purchase Order</option></select></label></div>
                {referenceType !== 'none' && <label className="mt-5 block"><span className="mb-2 block text-sm font-bold text-slate-700">Referensi {referenceType === 'sale' ? 'Penjualan' : 'Purchase Order'}</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked || referenceLoading} onChange={(event) => setReferenceId(event.target.value)} required value={referenceId}><option value="">{referenceLoading ? 'Memuat referensi...' : 'Pilih referensi'}</option>{referenceType === 'sale' ? sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.transaction_number} — {formatDate(sale.created_at.slice(0, 10))}</option>) : purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number} — {order.status}</option>)}</select></label>}
                <label className="mt-5 block"><span className="mb-2 block text-sm font-bold text-slate-700">Keterangan <span className="font-medium text-slate-400">(opsional)</span></span><textarea className="min-h-28 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={formLocked} maxLength={500} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
                {pendingAttempt && <p className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Respons sebelumnya belum diterima. Data dikunci untuk mencegah transaksi ganda; coba ulang akan memakai request yang sama.</p>}
                {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
                <div className="mt-7 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={formLocked} onClick={closeForm} type="button">Batal</button>{pendingAttempt ? <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={submitting} onClick={() => void retryPendingTransaction()} type="button">{submitting ? 'Menyimpan...' : 'Coba ulang transaksi'}</button> : <button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={submitting} onClick={() => void saveTransaction()} type="button">{submitting ? 'Menyimpan...' : 'Simpan transaksi'}</button>}</div>
            </div></div>}
        </div>
    );
}

function SummaryCard({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6"><p className="text-sm font-semibold text-slate-500">{label}</p><p className={`mt-3 text-2xl font-bold ${valueClass}`}>{value}</p></section>;
}

function FinanceRow({ transaction }: { transaction: FinanceTransaction }) {
    const saleNumber = firstRelation(transaction.sales)?.transaction_number;
    const purchaseOrderNumber = firstRelation(transaction.purchase_orders)?.order_number;
    const isCashIn = transaction.transaction_type === 'cash_in';
    return <tr><td className="whitespace-nowrap px-5 py-4 text-slate-600 sm:px-6">{formatDate(transaction.transaction_date)}</td><td className="px-5 py-4"><span className={isCashIn ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700'}>{isCashIn ? 'Kas masuk' : 'Kas keluar'}</span></td><td className="px-5 py-4 font-bold text-[#0b2254]">{transaction.category}</td><td className="max-w-64 px-5 py-4 text-slate-600">{transaction.description || '—'}</td><td className="px-5 py-4 text-slate-600">{transaction.payment_method}</td><td className="px-5 py-4 text-slate-600">{saleNumber ? `Penjualan ${saleNumber}` : purchaseOrderNumber ? `PO ${purchaseOrderNumber}` : '—'}</td><td className={`whitespace-nowrap px-5 py-4 text-right font-bold sm:px-6 ${isCashIn ? 'text-emerald-700' : 'text-rose-700'}`}>{isCashIn ? '+' : '−'}{formatRupiah(transaction.amount)}</td></tr>;
}
