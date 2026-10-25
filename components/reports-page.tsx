'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type Tab = 'summary' | 'sales' | 'inventory' | 'purchase_orders' | 'finance';
type ReportSummary = { sales_total: number | string; sales_transaction_count: number | string; inventory_movement_count: number | string; stock_in_quantity: number | string; stock_out_quantity: number | string; purchase_order_count: number | string; purchase_order_total: number | string };
type CashSummary = { cash_in: number | string; cash_out: number | string; net_cash_flow: number | string; transaction_count: number | string };
type Sale = { id: string; transaction_number: string; status: 'completed' | 'cancelled'; total: number | string; notes: string | null; created_at: string; customers: { name: string } | null };
type InventoryMovement = { id: string; movement_type: 'stock_in' | 'stock_out'; quantity: number; stock_before: number; stock_after: number; notes: string | null; created_at: string; products: { name: string; sku: string; unit: string } | null };
type PurchaseOrder = { id: string; order_number: string; order_date: string; status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled'; total: number | string; created_at: string; suppliers: { name: string } | null };
type Relation = { transaction_number?: string; order_number?: string };
type FinanceTransaction = { id: string; transaction_type: 'cash_in' | 'cash_out'; category: string; amount: number | string; transaction_date: string; payment_method: string; description: string | null; sales: Relation | Relation[] | null; purchase_orders: Relation | Relation[] | null };

const emptyReportSummary: ReportSummary = { sales_total: 0, sales_transaction_count: 0, inventory_movement_count: 0, stock_in_quantity: 0, stock_out_quantity: 0, purchase_order_count: 0, purchase_order_total: 0 };
const emptyCashSummary: CashSummary = { cash_in: 0, cash_out: 0, net_cash_flow: 0, transaction_count: 0 };
const tabs: { id: Tab; label: string }[] = [{ id: 'summary', label: 'Ringkasan' }, { id: 'sales', label: 'Penjualan' }, { id: 'inventory', label: 'Inventori' }, { id: 'purchase_orders', label: 'Purchase Order' }, { id: 'finance', label: 'Keuangan' }];
const formatRupiah = (value: number | string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(value));
const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function dateInputValue(value: Date) {
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function nextDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + 1);
    return dateInputValue(date);
}

function relation(value: Relation | Relation[] | null) {
    return Array.isArray(value) ? value[0] ?? null : value;
}

function isAccessError(error: unknown) {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42501';
}

export function ReportsPage() {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [periodReady, setPeriodReady] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('summary');
    const [summary, setSummary] = useState<ReportSummary>(emptyReportSummary);
    const [cashSummary, setCashSummary] = useState<CashSummary>(emptyCashSummary);
    const [sales, setSales] = useState<Sale[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function loadReports() {
        if (!startDate || !endDate || startDate > endDate) {
            setLoading(false);
            setError('Tanggal mulai tidak boleh melebihi tanggal akhir.');
            return;
        }

        setLoading(true);
        setError(null);
        const endExclusive = nextDate(endDate);
        try {
            const supabase = createClient();
            const [summaryResult, cashResult, salesResult, movementsResult, ordersResult, financeResult] = await Promise.all([
                supabase.rpc('get_reports_summary', { p_start_date: startDate, p_end_date: endDate }),
                supabase.rpc('get_finance_cash_summary', { p_start_date: startDate, p_end_date: endDate }),
                supabase.from('sales').select('id, transaction_number, status, total, notes, created_at, customers(name)').gte('created_at', startDate).lt('created_at', endExclusive).order('created_at', { ascending: false }).limit(100),
                supabase.from('inventory_movements').select('id, movement_type, quantity, stock_before, stock_after, notes, created_at, products(name, sku, unit)').gte('created_at', startDate).lt('created_at', endExclusive).order('created_at', { ascending: false }).limit(100),
                supabase.from('purchase_orders').select('id, order_number, order_date, status, total, created_at, suppliers(name)').gte('order_date', startDate).lte('order_date', endDate).order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
                supabase.from('finance_transactions').select('id, transaction_type, category, amount, transaction_date, payment_method, description, sales(transaction_number), purchase_orders(order_number)').gte('transaction_date', startDate).lte('transaction_date', endDate).order('transaction_date', { ascending: false }).limit(100),
            ]);
            const results = [summaryResult, cashResult, salesResult, movementsResult, ordersResult, financeResult];
            const failure = results.find((result) => result.error)?.error;
            if (failure) throw failure;

            setSummary(((Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data) ?? emptyReportSummary) as ReportSummary);
            setCashSummary(((Array.isArray(cashResult.data) ? cashResult.data[0] : cashResult.data) ?? emptyCashSummary) as CashSummary);
            setSales((salesResult.data ?? []) as unknown as Sale[]);
            setMovements((movementsResult.data ?? []) as unknown as InventoryMovement[]);
            setPurchaseOrders((ordersResult.data ?? []) as unknown as PurchaseOrder[]);
            setFinanceTransactions((financeResult.data ?? []) as unknown as FinanceTransaction[]);
        } catch (caughtError) {
            setSummary(emptyReportSummary);
            setCashSummary(emptyCashSummary);
            setSales([]);
            setMovements([]);
            setPurchaseOrders([]);
            setFinanceTransactions([]);
            setError(isAccessError(caughtError) ? 'Anda tidak memiliki akses untuk melihat laporan.' : 'Laporan belum dapat dimuat. Periksa koneksi atau hak akses Anda lalu coba lagi.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const today = new Date();
        setStartDate(dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)));
        setEndDate(dateInputValue(today));
        setPeriodReady(true);
    }, []);

    useEffect(() => {
        if (periodReady) void loadReports();
    }, [periodReady]);

    function applyPeriod() {
        void loadReports();
    }

    return <div className="max-w-6xl">
        <div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Analisis</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Laporan</h1><p className="mt-2 text-slate-500">Tinjau penjualan, pergerakan stok, Purchase Order, dan arus kas pada satu periode.</p></div>
        <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6"><div className="flex flex-wrap items-end gap-4"><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tanggal mulai</span><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" max={endDate} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tanggal akhir</span><input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label><button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={loading} onClick={applyPeriod} type="button">{loading ? 'Memuat...' : 'Terapkan filter'}</button></div></section>
        {error && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Jenis laporan">{tabs.map((tab) => <button aria-selected={activeTab === tab.id} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`} key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" type="button">{tab.label}</button>)}</div>
        {activeTab === 'summary' && <SummaryReport summary={summary} cashSummary={cashSummary} loading={loading} />}
        {activeTab === 'sales' && <SalesReport rows={sales} loading={loading} />}
        {activeTab === 'inventory' && <InventoryReport rows={movements} loading={loading} />}
        {activeTab === 'purchase_orders' && <PurchaseOrdersReport rows={purchaseOrders} loading={loading} />}
        {activeTab === 'finance' && <FinanceReport rows={financeTransactions} summary={cashSummary} loading={loading} />}
    </div>;
}

function SummaryReport({ summary, cashSummary, loading }: { summary: ReportSummary; cashSummary: CashSummary; loading: boolean }) {
    const cards = [
        { label: 'Total Penjualan', value: formatRupiah(summary.sales_total), note: `${Number(summary.sales_transaction_count).toLocaleString('id-ID')} transaksi selesai`, color: 'text-blue-700' },
        { label: 'Pergerakan Stok', value: Number(summary.inventory_movement_count).toLocaleString('id-ID'), note: `${Number(summary.stock_in_quantity).toLocaleString('id-ID')} masuk · ${Number(summary.stock_out_quantity).toLocaleString('id-ID')} keluar`, color: 'text-violet-700' },
        { label: 'Purchase Order', value: Number(summary.purchase_order_count).toLocaleString('id-ID'), note: `Nilai tercatat ${formatRupiah(summary.purchase_order_total)}`, color: 'text-amber-700' },
        { label: 'Kas Masuk', value: formatRupiah(cashSummary.cash_in), note: `${Number(cashSummary.transaction_count).toLocaleString('id-ID')} transaksi kas`, color: 'text-emerald-700' },
        { label: 'Kas Keluar', value: formatRupiah(cashSummary.cash_out), note: 'Berdasarkan transaksi kas tercatat', color: 'text-rose-700' },
        { label: 'Arus Kas Bersih', value: formatRupiah(cashSummary.net_cash_flow), note: 'Bukan laba bersih', color: Number(cashSummary.net_cash_flow) >= 0 ? 'text-blue-700' : 'text-rose-700' },
    ];
    return <><div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6" key={card.label}><p className="text-sm font-semibold text-slate-500">{card.label}</p><p className={`mt-3 text-2xl font-bold ${card.color}`}>{loading ? '—' : card.value}</p><p className="mt-2 text-xs text-slate-500">{card.note}</p></section>)}</div><section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900"><span className="font-bold">Catatan perhitungan:</span> total penjualan hanya menghitung transaksi berstatus selesai. Nilai PO adalah nilai pesanan yang tercatat, bukan kas keluar atau pembayaran supplier. Arus kas hanya berasal dari transaksi Keuangan yang benar-benar dicatat.</section></>;
}

function SalesReport({ rows, loading }: { rows: Sale[]; loading: boolean }) {
    return <TableCard title="Laporan Penjualan" description="Penjualan pada periode berdasarkan waktu pencatatan transaksi." loading={loading} empty="Belum ada transaksi penjualan pada periode ini." hasRows={rows.length > 0}><table className="w-full min-w-[52rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th>Tanggal</th><th>Transaksi</th><th>Pelanggan</th><th>Status</th><th>Catatan</th><th className="text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((sale) => <tr key={sale.id}><td>{formatDateTime(sale.created_at)}</td><td className="font-bold text-[#0b2254]">{sale.transaction_number}</td><td>{sale.customers?.name ?? 'Umum'}</td><td><StatusBadge status={sale.status} /></td><td className="max-w-64">{sale.notes || '—'}</td><td className="text-right font-bold">{formatRupiah(sale.total)}</td></tr>)}</tbody></table></TableCard>;
}

function InventoryReport({ rows, loading }: { rows: InventoryMovement[]; loading: boolean }) {
    return <TableCard title="Laporan Inventori" description="Riwayat pergerakan stok pada periode berdasarkan waktu pencatatan." loading={loading} empty="Belum ada pergerakan stok pada periode ini." hasRows={rows.length > 0}><table className="w-full min-w-[56rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th>Waktu</th><th>Produk</th><th>Pergerakan</th><th>Stok</th><th>Catatan</th><th>SKU</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((movement) => <tr key={movement.id}><td>{formatDateTime(movement.created_at)}</td><td className="font-bold text-[#0b2254]">{movement.products?.name ?? 'Produk tidak tersedia'}</td><td><span className={movement.movement_type === 'stock_in' ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{movement.movement_type === 'stock_in' ? '+' : '−'}{movement.quantity} {movement.products?.unit ?? ''}</span></td><td>{movement.stock_before} → <span className="font-bold">{movement.stock_after}</span></td><td className="max-w-64">{movement.notes || '—'}</td><td>{movement.products?.sku ?? '—'}</td></tr>)}</tbody></table></TableCard>;
}

function PurchaseOrdersReport({ rows, loading }: { rows: PurchaseOrder[]; loading: boolean }) {
    return <TableCard title="Laporan Purchase Order" description="PO pada periode berdasarkan tanggal PO. Nilainya bukan pembayaran supplier." loading={loading} empty="Belum ada Purchase Order pada periode ini." hasRows={rows.length > 0}><table className="w-full min-w-[52rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th>Tanggal PO</th><th>Nomor PO</th><th>Supplier</th><th>Status</th><th className="text-right">Nilai PO</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((order) => <tr key={order.id}><td>{formatDate(order.order_date)}</td><td className="font-bold text-[#0b2254]">{order.order_number}</td><td>{order.suppliers?.name ?? 'Supplier tidak tersedia'}</td><td><StatusBadge status={order.status} /></td><td className="text-right font-bold">{formatRupiah(order.total)}</td></tr>)}</tbody></table></TableCard>;
}

function FinanceReport({ rows, summary, loading }: { rows: FinanceTransaction[]; summary: CashSummary; loading: boolean }) {
    return <><div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><MiniCard label="Kas Masuk" value={formatRupiah(summary.cash_in)} color="text-emerald-700" /><MiniCard label="Kas Keluar" value={formatRupiah(summary.cash_out)} color="text-rose-700" /><MiniCard label="Arus Kas Bersih" value={formatRupiah(summary.net_cash_flow)} color={Number(summary.net_cash_flow) >= 0 ? 'text-blue-700' : 'text-rose-700'} /><MiniCard label="Jumlah Transaksi" value={Number(summary.transaction_count).toLocaleString('id-ID')} color="text-[#0b2254]" /></div><TableCard title="Laporan Keuangan" description="Arus kas dari transaksi Keuangan yang benar-benar dicatat." loading={loading} empty="Belum ada transaksi keuangan pada periode ini." hasRows={rows.length > 0}><table className="w-full min-w-[64rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th>Metode</th><th>Referensi</th><th className="text-right">Nominal</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((transaction) => { const sale = relation(transaction.sales)?.transaction_number; const order = relation(transaction.purchase_orders)?.order_number; const incoming = transaction.transaction_type === 'cash_in'; return <tr key={transaction.id}><td>{formatDate(transaction.transaction_date)}</td><td><span className={incoming ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700'}>{incoming ? 'Kas masuk' : 'Kas keluar'}</span></td><td className="font-bold text-[#0b2254]">{transaction.category}</td><td className="max-w-64">{transaction.description || '—'}</td><td>{transaction.payment_method}</td><td>{sale ? `Penjualan ${sale}` : order ? `PO ${order}` : '—'}</td><td className={`text-right font-bold ${incoming ? 'text-emerald-700' : 'text-rose-700'}`}>{incoming ? '+' : '−'}{formatRupiah(transaction.amount)}</td></tr>; })}</tbody></table></TableCard></>;
}

function TableCard({ title, description, loading, empty, hasRows, children }: { title: string; description: string; loading: boolean; empty: string; hasRows: boolean; children: React.ReactNode }) {
    return <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-[#0b2254]">{title}</h2><p className="mt-1 text-sm text-slate-500">{description} Menampilkan maksimal 100 data terbaru.</p></div><div className="overflow-x-auto">{children}</div>{loading && <p className="px-5 py-8 text-center text-slate-500">Memuat laporan...</p>}{!loading && !hasRows && <p className="px-5 py-8 text-center text-slate-500">{empty}</p>}</section>;
}

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
    return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-sm font-semibold text-slate-500">{label}</p><p className={`mt-3 text-xl font-bold ${color}`}>{value}</p></section>;
}

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = { completed: 'Selesai', cancelled: 'Dibatalkan', draft: 'Draft', ordered: 'Dipesan', partially_received: 'Diterima sebagian', received: 'Diterima' };
    const styles: Record<string, string> = { completed: 'bg-emerald-50 text-emerald-700', received: 'bg-emerald-50 text-emerald-700', ordered: 'bg-blue-50 text-blue-700', partially_received: 'bg-amber-50 text-amber-700', draft: 'bg-slate-100 text-slate-700', cancelled: 'bg-rose-50 text-rose-700' };
    return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>{labels[status] ?? status}</span>;
}
