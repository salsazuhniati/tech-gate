'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type Product = {
    id: string;
    name: string;
    sku: string;
    stock: number;
    minimum_stock: number;
    unit: string;
    status: 'Aktif' | 'Nonaktif';
};

type InventoryMovement = {
    id: string;
    movement_type: 'stock_in' | 'stock_out';
    quantity: number;
    stock_before: number;
    stock_after: number;
    notes: string | null;
    created_at: string;
    products: Pick<Product, 'name' | 'sku' | 'unit'> | null;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function InventoryPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function loadInventory() {
        setLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const [productsResult, movementsResult] = await Promise.all([
                supabase.from('products').select('id, name, sku, stock, minimum_stock, unit, status').order('name'),
                supabase.from('inventory_movements').select('id, movement_type, quantity, stock_before, stock_after, notes, created_at, products(name, sku, unit)').order('created_at', { ascending: false }).limit(50),
            ]);

            if (productsResult.error) throw productsResult.error;
            if (movementsResult.error) throw movementsResult.error;

            setProducts((productsResult.data ?? []) as Product[]);
            setMovements((movementsResult.data ?? []) as unknown as InventoryMovement[]);
        } catch {
            setError('Data inventori belum dapat dimuat. Pastikan migration Inventori sudah diterapkan dan akses Anda tersedia.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadInventory();
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        const form = event.currentTarget;
        const formData = new FormData(form);
        const productId = String(formData.get('product_id') ?? '');
        const movementType = String(formData.get('movement_type') ?? '');
        const quantity = Number(formData.get('quantity'));
        const notes = String(formData.get('notes') ?? '');

        if (!productId || !['stock_in', 'stock_out'].includes(movementType) || !Number.isInteger(quantity) || quantity <= 0) {
            setError('Pilih produk serta isi kuantitas berupa bilangan bulat lebih besar dari nol.');
            return;
        }

        setSubmitting(true);

        try {
            const supabase = createClient();
            const { error: rpcError } = await supabase.rpc('record_inventory_movement', {
                p_product_id: productId,
                p_movement_type: movementType,
                p_quantity: quantity,
                p_notes: notes,
            });

            if (rpcError) throw rpcError;

            form.reset();
            setSuccess('Pergerakan stok berhasil dicatat.');
            await loadInventory();
        } catch (caughtError) {
            const message = caughtError instanceof Error ? caughtError.message : '';
            setError(message || 'Pergerakan stok tidak dapat dicatat. Periksa data dan hak akses Anda.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="max-w-6xl">
            <p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">Operasional</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">Inventori</h1>
            <p className="mt-2 text-slate-500">Pantau stok produk dan catat setiap pergerakan barang.</p>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                        <div>
                            <h2 className="font-bold text-[#0b2254]">Stok produk</h2>
                            <p className="mt-1 text-sm text-slate-500">Produk dengan stok minimum diberi penanda.</p>
                        </div>
                        <button className="text-sm font-bold text-blue-600 hover:text-blue-700" onClick={() => void loadInventory()} type="button">Muat ulang</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[38rem] text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr><th className="px-5 py-3 sm:px-6">Produk</th><th className="px-5 py-3">Stok</th><th className="px-5 py-3">Minimum</th><th className="px-5 py-3 sm:px-6">Status</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {!loading && products.map((product) => {
                                    const lowStock = product.status === 'Aktif' && product.stock <= product.minimum_stock;
                                    return <tr key={product.id}>
                                        <td className="px-5 py-4 sm:px-6"><span className="block font-bold text-[#0b2254]">{product.name}</span><span className="mt-1 block text-xs text-slate-400">{product.sku}</span></td>
                                        <td className="px-5 py-4 font-bold text-slate-700">{product.stock} {product.unit}</td>
                                        <td className="px-5 py-4 text-slate-600">{product.minimum_stock} {product.unit}</td>
                                        <td className="px-5 py-4 sm:px-6"><span className={lowStock ? 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700' : 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700'}>{lowStock ? 'Stok menipis' : 'Aman'}</span></td>
                                    </tr>;
                                })}
                                {!loading && products.length === 0 && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={4}>Belum ada produk untuk dipantau.</td></tr>}
                                {loading && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={4}>Memuat data inventori…</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="h-fit rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
                    <h2 className="font-bold text-[#0b2254]">Catat pergerakan stok</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Stok masuk atau keluar akan dicatat sebagai riwayat.</p>
                    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                        <label className="block text-sm font-bold text-slate-700">Produk<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={submitting || loading} name="product_id" required defaultValue=""><option disabled value="">Pilih produk</option>{products.filter((product) => product.status === 'Aktif').map((product) => <option key={product.id} value={product.id}>{product.name} ({product.stock} {product.unit})</option>)}</select></label>
                        <label className="block text-sm font-bold text-slate-700">Jenis pergerakan<select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={submitting} name="movement_type" defaultValue="stock_in"><option value="stock_in">Stok masuk</option><option value="stock_out">Stok keluar</option></select></label>
                        <label className="block text-sm font-bold text-slate-700">Kuantitas<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={submitting} min="1" name="quantity" required step="1" type="number" /></label>
                        <label className="block text-sm font-bold text-slate-700">Catatan <span className="font-medium text-slate-400">(opsional)</span><textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" disabled={submitting} maxLength={500} name="notes" /></label>
                        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
                        {success && <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p>}
                        <button className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300" disabled={submitting || loading} type="submit">{submitting ? 'Mencatat…' : 'Catat pergerakan'}</button>
                    </form>
                </section>
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-[#0b2254]">Riwayat pergerakan</h2><p className="mt-1 text-sm text-slate-500">Menampilkan maksimal 50 catatan terbaru.</p></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 sm:px-6">Waktu</th><th className="px-5 py-3">Produk</th><th className="px-5 py-3">Pergerakan</th><th className="px-5 py-3">Stok</th><th className="px-5 py-3 sm:px-6">Catatan</th></tr></thead><tbody className="divide-y divide-slate-100">{!loading && movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-5 py-4 text-slate-600 sm:px-6">{formatDate(movement.created_at)}</td><td className="px-5 py-4"><span className="block font-bold text-[#0b2254]">{movement.products?.name ?? 'Produk tidak tersedia'}</span><span className="mt-1 block text-xs text-slate-400">{movement.products?.sku ?? '—'}</span></td><td className="px-5 py-4"><span className={movement.movement_type === 'stock_in' ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{movement.movement_type === 'stock_in' ? '+' : '−'}{movement.quantity} {movement.products?.unit ?? ''}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-600">{movement.stock_before} → <span className="font-bold text-slate-800">{movement.stock_after}</span></td><td className="px-5 py-4 text-slate-600 sm:px-6">{movement.notes || '—'}</td></tr>)}{!loading && movements.length === 0 && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={5}>Belum ada riwayat pergerakan stok.</td></tr>}{loading && <tr><td className="px-5 py-8 text-center text-slate-500 sm:px-6" colSpan={5}>Memuat riwayat…</td></tr>}</tbody></table></div>
            </section>
        </div>
    );
}
