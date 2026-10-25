'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; sku: string; purchase_price: number; unit: string; status: 'Aktif' | 'Nonaktif' };
type POItem = { id: string; product_id: string; product_name: string; product_sku: string; purchase_price: number; quantity_ordered: number; quantity_received: number; subtotal: number };
type PurchaseOrder = { id: string; order_number: string; supplier_id: string; order_date: string; status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled'; total: number; notes: string | null; created_at: string; suppliers: Supplier | null; purchase_order_items: POItem[] };
type DraftItem = { productId: string; quantity: number; purchasePrice: number };
type RpcErrorDetails = { message?: string; code?: string; details?: string; hint?: string };

const formatRupiah = (value: number | string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(value));
const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
const statusLabel: Record<PurchaseOrder['status'], string> = { draft: 'Draft', ordered: 'Dipesan', partially_received: 'Diterima sebagian', received: 'Diterima', cancelled: 'Dibatalkan' };
const statusClass: Record<PurchaseOrder['status'], string> = { draft: 'bg-slate-100 text-slate-700', ordered: 'bg-blue-50 text-blue-700', partially_received: 'bg-amber-50 text-amber-700', received: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-700' };

function rpcErrorDetails(error: unknown): RpcErrorDetails | null {
    if (typeof error !== 'object' || error === null) return null;

    const source = error as Record<string, unknown>;
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;

    return {
        message: text(source.message),
        code: text(source.code),
        details: text(source.details),
        hint: text(source.hint),
    };
}

function errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return rpcErrorDetails(error)?.message ?? fallback;
}

function logReceiveError(error: unknown) {
    if (process.env.NODE_ENV !== 'development') return;

    const diagnostic = rpcErrorDetails(error);
    console.error('[Purchase Orders] Penerimaan barang gagal.', diagnostic ?? {
        message: error instanceof Error ? error.message : 'Error tanpa detail yang dapat dibaca.',
    });
}

export function PurchaseOrdersPage() {
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<PurchaseOrder | null>(null);
    const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
    const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
    const [supplierId, setSupplierId] = useState('');
    const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
    const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});
    const [receiveRequestId, setReceiveRequestId] = useState('');

    async function loadData() {
        setLoading(true);
        try {
            const supabase = createClient();
            const [ordersResult, suppliersResult, productsResult] = await Promise.all([
                supabase.from('purchase_orders').select('id, order_number, supplier_id, order_date, status, total, notes, created_at, suppliers(id, name), purchase_order_items(id, product_id, product_name, product_sku, purchase_price, quantity_ordered, quantity_received, subtotal)').order('created_at', { ascending: false }).limit(100),
                supabase.from('suppliers').select('id, name').order('name'),
                supabase.from('products').select('id, name, sku, purchase_price, unit, status').eq('status', 'Aktif').order('name'),
            ]);
            if (ordersResult.error) throw ordersResult.error;
            if (suppliersResult.error) throw suppliersResult.error;
            if (productsResult.error) throw productsResult.error;
            setOrders((ordersResult.data ?? []) as unknown as PurchaseOrder[]);
            setSuppliers((suppliersResult.data ?? []) as Supplier[]);
            setProducts((productsResult.data ?? []) as Product[]);
        } catch (caught) {
            setError(errorMessage(caught, 'Data Purchase Order belum dapat dimuat. Pastikan migration sudah diterapkan dan akses tersedia.'));
        } finally { setLoading(false); }
    }

    useEffect(() => { void loadData(); }, []);
    const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return !query ? orders : orders.filter((order) => order.order_number.toLowerCase().includes(query) || order.suppliers?.name.toLowerCase().includes(query)); }, [orders, search]);
    const draftTotal = draftItems.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);

    function openCreate() { setError(null); setNotice(null); setEditing({} as PurchaseOrder); setSupplierId(''); setOrderDate(new Date().toISOString().slice(0, 10)); setNotes(''); setDraftItems([]); }
    function openEdit(order: PurchaseOrder) { setError(null); setNotice(null); setEditing(order); setSupplierId(order.supplier_id); setOrderDate(order.order_date); setNotes(order.notes ?? ''); setDraftItems(order.purchase_order_items.map((item) => ({ productId: item.product_id, quantity: Number(item.quantity_ordered), purchasePrice: Number(item.purchase_price) }))); }
    function addItem() { const next = products.find((product) => !draftItems.some((item) => item.productId === product.id)); if (!next) { setError('Semua produk aktif sudah ditambahkan.'); return; } setDraftItems((items) => [...items, { productId: next.id, quantity: 1, purchasePrice: Number(next.purchase_price) }]); }
    function updateDraftItem(index: number, patch: Partial<DraftItem>) { setDraftItems((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }

    async function saveDraft() {
        setError(null); setNotice(null);
        if (!supplierId || !orderDate || draftItems.length === 0) { setError('Pilih supplier, tanggal, dan minimal satu produk.'); return; }
        if (draftItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) || new Set(draftItems.map((item) => item.productId)).size !== draftItems.length) { setError('Setiap item harus unik dengan kuantitas bulat positif dan harga beli valid.'); return; }
        setBusy(true);
        try {
            const { data, error: rpcError } = await createClient().rpc('save_purchase_order', { p_purchase_order_id: editing?.id || null, p_supplier_id: supplierId, p_order_date: orderDate, p_notes: notes || null, p_items: draftItems.map((item) => ({ product_id: item.productId, quantity: item.quantity, purchase_price: item.purchasePrice })) });
            if (rpcError) throw rpcError;
            const result = Array.isArray(data) ? data[0] : data;
            setEditing(null); setNotice(`Draft ${result?.order_number ?? 'PO'} berhasil disimpan.`); await loadData();
        } catch (caught) { setError(errorMessage(caught, 'Draft PO tidak dapat disimpan.')); } finally { setBusy(false); }
    }

    async function changeStatus(order: PurchaseOrder, action: 'order_purchase_order' | 'cancel_purchase_order') {
        setBusy(true); setError(null); setNotice(null);
        try { const { error: rpcError } = await createClient().rpc(action, { p_purchase_order_id: order.id }); if (rpcError) throw rpcError; setViewing(null); setNotice(action === 'order_purchase_order' ? `PO ${order.order_number} telah dipesan.` : `PO ${order.order_number} dibatalkan.`); await loadData(); }
        catch (caught) { setError(errorMessage(caught, 'Status PO tidak dapat diperbarui.')); } finally { setBusy(false); }
    }

    function openReceive(order: PurchaseOrder) { setError(null); setNotice(null); setReceiving(order); setReceiveRequestId(crypto.randomUUID()); setReceiveItems(Object.fromEntries(order.purchase_order_items.filter((item) => item.quantity_received < item.quantity_ordered).map((item) => [item.id, item.quantity_ordered - item.quantity_received]))); }
    async function receive() {
        if (!receiving) return;
        const items = Object.entries(receiveItems).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0).map(([purchase_order_item_id, quantity]) => ({ purchase_order_item_id, quantity }));
        if (!items.length) { setError('Isi minimal satu kuantitas penerimaan.'); return; }
        setBusy(true); setError(null); setNotice(null);
        try { const { error: rpcError } = await createClient().rpc('receive_purchase_order', { p_purchase_order_id: receiving.id, p_items: items, p_notes: null, p_idempotency_key: receiveRequestId }); if (rpcError) throw rpcError; setReceiving(null); setViewing(null); setNotice(`Penerimaan ${receiving.order_number} berhasil dicatat.`); await loadData(); }
        catch (caught) { logReceiveError(caught); setError(errorMessage(caught, 'Penerimaan barang tidak dapat diproses.')); } finally { setBusy(false); }
    }

    return <div className="max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Operasional</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Purchase Order</h1><p className="mt-2 text-slate-500">Kelola pesanan pembelian dan penerimaan barang supplier.</p></div><button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700" onClick={openCreate} type="button">+ Buat PO</button></div>
        {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}{error && !editing && !receiving && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-bold text-[#0b2254]">Daftar Purchase Order</h2><p className="mt-1 text-sm text-slate-500">Menampilkan maksimal 100 PO terbaru.</p></div><input aria-label="Cari PO" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-72" onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor atau supplier" value={search} /></div><div className="overflow-x-auto"><table className="w-full min-w-[52rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 sm:px-6">Nomor PO</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Total</th><th className="px-5 py-3 sm:px-6">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={6}>Memuat Purchase Order...</td></tr>}{!loading && filtered.map((order) => <tr key={order.id}><td className="px-5 py-4 font-bold text-[#0b2254] sm:px-6">{order.order_number}</td><td className="px-5 py-4 text-slate-600">{order.suppliers?.name ?? 'Supplier tidak tersedia'}</td><td className="px-5 py-4 text-slate-600">{formatDate(order.order_date)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[order.status]}`}>{statusLabel[order.status]}</span></td><td className="px-5 py-4 font-bold text-slate-700">{formatRupiah(order.total)}</td><td className="px-5 py-4 sm:px-6"><button className="font-bold text-blue-600 hover:text-blue-700" onClick={() => setViewing(order)} type="button">Detail</button></td></tr>)}{!loading && filtered.length === 0 && <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={6}>{orders.length ? 'Tidak ada PO yang sesuai pencarian.' : 'Belum ada Purchase Order.'}</td></tr>}</tbody></table></div></section>
        {editing && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-5" role="dialog" aria-modal="true"><div className="mx-auto my-6 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold text-[#0b2254]">{editing.id ? `Edit ${editing.order_number}` : 'Purchase Order baru'}</h2><p className="mt-1 text-sm text-slate-500">Stok tidak berubah sampai barang diterima.</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={busy} onClick={() => setEditing(null)} type="button">Tutup</button></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Supplier<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-blue-500" disabled={busy} onChange={(event) => setSupplierId(event.target.value)} value={supplierId}><option value="">Pilih supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="text-sm font-bold text-slate-700">Tanggal PO<input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500" disabled={busy} onChange={(event) => setOrderDate(event.target.value)} type="date" value={orderDate} /></label><label className="sm:col-span-2 text-sm font-bold text-slate-700">Catatan <span className="font-medium text-slate-400">(opsional)</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500" disabled={busy} maxLength={500} onChange={(event) => setNotes(event.target.value)} value={notes} /></label></div><div className="mt-7"><div className="flex items-center justify-between"><h3 className="font-bold text-[#0b2254]">Item pesanan</h3><button className="text-sm font-bold text-blue-600 disabled:text-slate-400" disabled={busy || !products.length} onClick={addItem} type="button">+ Tambah produk</button></div><div className="mt-3 space-y-3">{draftItems.map((item, index) => { const product = products.find((candidate) => candidate.id === item.productId); return <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_8rem_auto] sm:items-end" key={index}><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Produk</span><select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={busy} onChange={(event) => { const selected = products.find((candidate) => candidate.id === event.target.value); updateDraftItem(index, { productId: event.target.value, purchasePrice: Number(selected?.purchase_price ?? 0) }); }} value={item.productId}><option value="">Pilih produk</option>{products.map((candidate) => <option disabled={draftItems.some((other, otherIndex) => otherIndex !== index && other.productId === candidate.id)} key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.sku})</option>)}</select></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Jumlah</span><input className="w-full rounded-lg border border-slate-200 px-3 py-2.5" disabled={busy} min="1" onChange={(event) => updateDraftItem(index, { quantity: Number(event.target.value) })} type="number" value={item.quantity} /></label><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Harga beli</span><input className="w-full rounded-lg border border-slate-200 px-3 py-2.5" disabled={busy} min="0" onChange={(event) => updateDraftItem(index, { purchasePrice: Number(event.target.value) })} step="0.01" type="number" value={item.purchasePrice} /></label><p className="py-2.5 text-sm font-bold text-slate-700">{formatRupiah(item.quantity * item.purchasePrice)}</p><button className="rounded-lg px-2 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50" disabled={busy} onClick={() => setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index))} type="button">Hapus</button>{!product && null}</div>; })}</div></div><div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5"><p className="text-sm text-slate-500">{draftItems.length} produk dipilih</p><p className="text-xl font-bold text-[#0b2254]">Total: {formatRupiah(draftTotal)}</p></div>{error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-7 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={busy} onClick={() => setEditing(null)} type="button">Batal</button><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/20 disabled:bg-blue-300" disabled={busy} onClick={() => void saveDraft()} type="button">{busy ? 'Menyimpan...' : 'Simpan draft'}</button></div></div></div>}
        {viewing && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-5" role="dialog" aria-modal="true"><div className="mx-auto my-6 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-blue-600">{viewing.order_number}</p><h2 className="mt-1 text-2xl font-bold text-[#0b2254]">{viewing.suppliers?.name}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(viewing.order_date)} · {statusLabel[viewing.status]}</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" disabled={busy} onClick={() => setViewing(null)} type="button">Tutup</button></div><div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100">{viewing.purchase_order_items.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 p-4" key={item.id}><div><p className="font-bold text-[#0b2254]">{item.product_name}</p><p className="text-sm text-slate-500">{item.product_sku} · {item.quantity_received}/{item.quantity_ordered} diterima</p></div><p className="font-bold text-slate-700">{formatRupiah(item.subtotal)}</p></div>)}</div>{viewing.notes && <p className="mt-4 text-sm text-slate-600">Catatan: {viewing.notes}</p>}{error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-7 flex flex-wrap justify-end gap-3">{viewing.status === 'draft' && <><button className="rounded-xl px-5 py-3 font-bold text-red-600 hover:bg-red-50" disabled={busy} onClick={() => void changeStatus(viewing, 'cancel_purchase_order')} type="button">Batalkan draft</button><button className="rounded-xl px-5 py-3 font-bold text-blue-600 hover:bg-blue-50" disabled={busy} onClick={() => { setViewing(null); openEdit(viewing); }} type="button">Edit draft</button><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-blue-300" disabled={busy} onClick={() => void changeStatus(viewing, 'order_purchase_order')} type="button">{busy ? 'Memproses...' : 'Pesan PO'}</button></>}{(viewing.status === 'ordered' || viewing.status === 'partially_received') && <button className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:bg-emerald-300" disabled={busy} onClick={() => openReceive(viewing)} type="button">Terima barang</button>}</div></div></div>}
        {receiving && <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/45 p-5" role="dialog" aria-modal="true"><div className="mx-auto my-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"><h2 className="text-2xl font-bold text-[#0b2254]">Terima barang · {receiving.order_number}</h2><p className="mt-1 text-sm text-slate-500">Stok dan riwayat inventori dicatat atomik oleh server.</p><div className="mt-6 space-y-3">{receiving.purchase_order_items.filter((item) => item.quantity_received < item.quantity_ordered).map((item) => <div className="grid grid-cols-[1fr_7rem] items-end gap-4 rounded-xl border border-slate-200 p-4" key={item.id}><div><p className="font-bold text-[#0b2254]">{item.product_name}</p><p className="mt-1 text-sm text-slate-500">Sisa: {item.quantity_ordered - item.quantity_received}</p></div><label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Diterima</span><input className="w-full rounded-lg border border-slate-200 px-3 py-2.5" disabled={busy} max={item.quantity_ordered - item.quantity_received} min="0" onChange={(event) => setReceiveItems((items) => ({ ...items, [item.id]: Number(event.target.value) }))} type="number" value={receiveItems[item.id] ?? 0} /></label></div>)}</div>{error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}<div className="mt-7 flex justify-end gap-3"><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" disabled={busy} onClick={() => setReceiving(null)} type="button">Batal</button><button className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:bg-emerald-300" disabled={busy} onClick={() => void receive()} type="button">{busy ? 'Menerima...' : 'Simpan penerimaan'}</button></div></div></div>}
    </div>;
}
