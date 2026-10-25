'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';

type MasterDataModule = 'categories' | 'suppliers' | 'customers' | 'products';
type Category = { id: string; name: string };
type Supplier = { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null };
type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null };
type Product = { id: string; name: string; sku: string; category_id: string; supplier_id: string | null; purchase_price: number | string; selling_price: number | string; stock: number; minimum_stock: number; unit: string; status: 'Aktif' | 'Nonaktif'; image_url: string | null; categories: Category | null; suppliers: Pick<Supplier, 'id' | 'name'> | null };
type MasterRecord = Category | Supplier | Customer | Product;

const content: Record<MasterDataModule, { eyebrow: string; title: string; description: string; singular: string }> = {
    categories: { eyebrow: 'Master Data', title: 'Kategori', description: 'Kelola pengelompokan produk toko Anda.', singular: 'Kategori' },
    suppliers: { eyebrow: 'Master Data', title: 'Supplier', description: 'Kelola data pemasok produk toko Anda.', singular: 'Supplier' },
    customers: { eyebrow: 'Master Data', title: 'Pelanggan', description: 'Kelola data pelanggan toko Anda.', singular: 'Pelanggan' },
    products: { eyebrow: 'Master Data', title: 'Monitoring Produk', description: 'Pantau stok dan status seluruh produk di katalog.', singular: 'Produk' },
};

function recordValue(record: MasterRecord | null, key: string): string {
    if (!record || !(key in record)) return '';
    const result = record[key as keyof MasterRecord];
    return result === null || typeof result === 'object' ? '' : String(result);
}

function databaseMessage(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('duplicate key') || normalized.includes('unique')) return 'Data dengan nilai unik yang sama sudah ada.';
    if (normalized.includes('foreign key')) return 'Data ini masih digunakan oleh data terkait sehingga tidak dapat dihapus.';
    if (normalized.includes('does not exist') || normalized.includes('schema cache')) return 'Tabel Master Data belum tersedia. Terapkan migrasi Supabase terlebih dahulu.';
    return 'Operasi tidak dapat diselesaikan. Silakan periksa kembali data Anda.';
}

function formatRupiah(amount: number | string): string {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount));
}

function optionalFields(form: FormData, fields: string[]): Record<string, string | null> {
    return Object.fromEntries(fields.map((field) => {
        const fieldValue = String(form.get(field) ?? '').trim();
        return [field, fieldValue || null];
    }));
}

export function MasterDataPage({ module, createMode = false }: { module: MasterDataModule; createMode?: boolean }) {
    const [records, setRecords] = useState<MasterRecord[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [suppliers, setSuppliers] = useState<Pick<Supplier, 'id' | 'name'>[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [editing, setEditing] = useState<MasterRecord | null | undefined>(createMode ? null : undefined);
    const [currentPage, setCurrentPage] = useState(1);
    const page = content[module];

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const supabase = createClient();
        const select = module === 'products' ? '*, categories(id, name), suppliers(id, name)' : '*';
        const { data, error: queryError } = await supabase.from(module).select(select).order('name');
        if (queryError) {
            setRecords([]);
            setError(databaseMessage(queryError.message));
            setIsLoading(false);
            return;
        }
        setRecords((data ?? []) as unknown as MasterRecord[]);
        setCurrentPage(1);
        if (module === 'products') {
            const [categoryResult, supplierResult] = await Promise.all([
                supabase.from('categories').select('id, name').order('name'),
                supabase.from('suppliers').select('id, name').order('name'),
            ]);
            if (categoryResult.error || supplierResult.error) {
                setError(databaseMessage((categoryResult.error ?? supplierResult.error)?.message ?? ''));
            } else {
                setCategories((categoryResult.data ?? []) as Category[]);
                setSuppliers((supplierResult.data ?? []) as Pick<Supplier, 'id' | 'name'>[]);
            }
        }
        setIsLoading(false);
    }, [module]);

    useEffect(() => { void load(); }, [load]);

    const table = useMemo(() => {
        if (module === 'categories') return { headers: ['Nama kategori'], cells: (record: MasterRecord) => [<span key="name" className="font-bold text-[#0b2254]">{recordValue(record, 'name')}</span>] };
        if (module === 'suppliers') return { headers: ['Supplier', 'Kontak', 'Telepon', 'Email'], cells: (record: MasterRecord) => [<span key="name" className="font-bold text-[#0b2254]">{recordValue(record, 'name')}</span>, recordValue(record, 'contact_name') || '—', recordValue(record, 'phone') || '—', recordValue(record, 'email') || '—'] };
        if (module === 'customers') return { headers: ['Pelanggan', 'Telepon', 'Email', 'Alamat'], cells: (record: MasterRecord) => [<span key="name" className="font-bold text-[#0b2254]">{recordValue(record, 'name')}</span>, recordValue(record, 'phone') || '—', recordValue(record, 'email') || '—', recordValue(record, 'address') || '—'] };
        return {
            headers: ['Produk', 'Kategori', 'Supplier', 'Harga jual', 'Stok', 'Status'],
            cells: (record: MasterRecord) => {
                const product = record as Product;
                return [
                    <span key="product"><span className="block font-bold text-[#0b2254]">{product.name}</span><span className="mt-1 block text-xs text-slate-400">{product.sku}</span></span>,
                    product.categories?.name ?? '—',
                    product.suppliers?.name ?? '—',
                    <span key="price" className="font-semibold text-slate-700">{formatRupiah(product.selling_price)}</span>,
                    <span key="stock" className={product.stock <= product.minimum_stock ? 'font-bold text-amber-600' : 'font-bold text-slate-700'}>{product.stock} {product.unit}</span>,
                    <span key="status" className={product.status === 'Aktif' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'}>{product.status}</span>,
                ];
            },
        };
    }, [module]);
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const visibleRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => {
        setCurrentPage((pageNumber) => Math.min(pageNumber, totalPages));
    }, [totalPages]);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get('name') ?? '').trim();
        if (!name) { setError('Nama wajib diisi.'); return; }
        const payload: Record<string, string | number | null> = { name };
        if (module === 'suppliers') Object.assign(payload, optionalFields(form, ['contact_name', 'phone', 'email', 'address']));
        if (module === 'customers') Object.assign(payload, optionalFields(form, ['phone', 'email', 'address']));
        if (module === 'products') {
            const sku = String(form.get('sku') ?? '').trim();
            const categoryId = String(form.get('category_id') ?? '');
            const numbers = ['purchase_price', 'selling_price', 'stock', 'minimum_stock'].reduce<Record<string, number>>((values, field) => ({ ...values, [field]: Number(form.get(field)) }), {});
            if (!sku || !categoryId || Object.values(numbers).some((number) => !Number.isFinite(number) || number < 0)) {
                setError('SKU, kategori, harga, dan stok wajib diisi dengan nilai nol atau lebih.');
                return;
            }
            Object.assign(payload, { sku, category_id: categoryId, supplier_id: String(form.get('supplier_id') ?? '') || null, ...numbers, unit: String(form.get('unit') ?? '').trim() || 'unit', status: String(form.get('status') ?? 'Aktif'), image_url: String(form.get('image_url') ?? '').trim() || null });
        }
        const supabase = createClient();
        setIsSaving(true); setError(null); setNotice(null);
        const id = editing ? editing.id : null;
        const result = id ? await supabase.from(module).update(payload).eq('id', id) : await supabase.from(module).insert(payload);
        setIsSaving(false);
        if (result.error) { setError(databaseMessage(result.error.message)); return; }
        setEditing(undefined);
        setNotice(page.singular + ' berhasil ' + (id ? 'diperbarui.' : 'ditambahkan.'));
        await load();
    }

    async function remove(record: MasterRecord) {
        if (!window.confirm('Hapus ' + page.singular.toLowerCase() + ' "' + record.name + '"?')) return;
        setError(null); setNotice(null);
        const { error: deleteError } = await createClient().from(module).delete().eq('id', record.id);
        if (deleteError) { setError(databaseMessage(deleteError.message)); return; }
        setNotice(page.singular + ' berhasil dihapus.');
        await load();
    }

    return <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-bold uppercase tracking-[.16em] text-blue-600">{page.eyebrow}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0b2254]">{page.title}</h1><p className="mt-2 text-slate-500">{page.description}</p></div>
            <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700" onClick={() => { setError(null); setNotice(null); setEditing(null); }} type="button">+ Tambah {page.singular}</button>
        </div>
        {notice && <p className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}
        {error && <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="overflow-x-auto"><table className="w-full min-w-175 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr>{table.headers.map((header) => <th key={header} className="px-6 py-4">{header}</th>)}<th className="px-6 py-4 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="px-6 py-12 text-center text-slate-500" colSpan={table.headers.length + 1}>Memuat data...</td></tr> : records.length === 0 ? <tr><td className="px-6 py-12 text-center text-slate-500" colSpan={table.headers.length + 1}>Belum ada {page.singular.toLowerCase()}. Tambahkan data pertama Anda.</td></tr> : visibleRecords.map((record) => <tr key={record.id}>{table.cells(record).map((cell, index) => <td key={index} className="px-6 py-4 text-slate-600">{cell}</td>)}<td className="px-6 py-4"><div className="flex justify-end gap-3"><button className="font-bold text-blue-600" onClick={() => { setError(null); setNotice(null); setEditing(record); }} type="button">Ubah</button><button className="font-bold text-red-500" onClick={() => void remove(record)} type="button">Hapus</button></div></td></tr>)}
        </tbody></table></div>{records.length > pageSize && <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm"><p className="text-slate-500">Halaman {currentPage} dari {totalPages}</p><div className="flex gap-2"><button className="rounded-lg px-3 py-2 font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === 1} onClick={() => setCurrentPage((pageNumber) => pageNumber - 1)} type="button">Sebelumnya</button><button className="rounded-lg px-3 py-2 font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === totalPages} onClick={() => setCurrentPage((pageNumber) => pageNumber + 1)} type="button">Berikutnya</button></div></div>}</section>
        {editing !== undefined && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-5" role="dialog" aria-modal="true" aria-label={(editing ? 'Ubah ' : 'Tambah ') + page.singular}><form className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8" onSubmit={(event) => void save(event)}><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-[#0b2254]">{(editing ? 'Ubah ' : 'Tambah ') + page.singular}</h2><p className="mt-1 text-sm text-slate-500">Lengkapi informasi yang diperlukan.</p></div><button className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-50" onClick={() => setEditing(undefined)} type="button">Tutup</button></div><MasterDataForm module={module} record={editing} categories={categories} suppliers={suppliers} /><div className="mt-8 flex gap-3"><button className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'Menyimpan...' : 'Simpan'}</button><button className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-50" onClick={() => setEditing(undefined)} disabled={isSaving} type="button">Batal</button></div></form></div>}
    </div>;
}

function MasterDataForm({ module, record, categories, suppliers }: { module: MasterDataModule; record: MasterRecord | null; categories: Category[]; suppliers: Pick<Supplier, 'id' | 'name'>[] }) {
    return <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label={module === 'categories' ? 'Nama kategori' : 'Nama ' + content[module].singular.toLowerCase()} name="name" required value={recordValue(record, 'name')} />
        {module === 'suppliers' && <><Field label="Nama kontak" name="contact_name" value={recordValue(record, 'contact_name')} /><Field label="Nomor telepon" name="phone" type="tel" pattern="[0-9+ ()-]{6,25}" value={recordValue(record, 'phone')} /><Field label="Email" name="email" type="email" value={recordValue(record, 'email')} /><TextArea label="Alamat" name="address" value={recordValue(record, 'address')} /></>}
        {module === 'customers' && <><Field label="Nomor telepon" name="phone" type="tel" pattern="[0-9+ ()-]{6,25}" value={recordValue(record, 'phone')} /><Field label="Email" name="email" type="email" value={recordValue(record, 'email')} /><TextArea label="Alamat" name="address" value={recordValue(record, 'address')} /></>}
        {module === 'products' && <ProductFields record={record as Product | null} categories={categories} suppliers={suppliers} />}
    </div>;
}

function ProductFields({ record, categories, suppliers }: { record: Product | null; categories: Category[]; suppliers: Pick<Supplier, 'id' | 'name'>[] }) {
    return <><Field label="SKU" name="sku" required value={recordValue(record, 'sku')} /><Select label="Kategori" name="category_id" required value={recordValue(record, 'category_id')} options={categories.map((category) => ({ value: category.id, label: category.name }))} placeholder="Pilih kategori" /><Select label="Supplier" name="supplier_id" value={recordValue(record, 'supplier_id')} options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} placeholder="Tanpa supplier" /><Field label="Harga beli (Rp)" name="purchase_price" required type="number" min="0" value={recordValue(record, 'purchase_price') || '0'} /><Field label="Harga jual (Rp)" name="selling_price" required type="number" min="0" value={recordValue(record, 'selling_price') || '0'} /><Field label="Stok" name="stock" required type="number" min="0" value={recordValue(record, 'stock') || '0'} /><Field label="Stok minimum" name="minimum_stock" required type="number" min="0" value={recordValue(record, 'minimum_stock') || '0'} /><Field label="Satuan" name="unit" required value={recordValue(record, 'unit') || 'unit'} /><Select label="Status" name="status" required value={recordValue(record, 'status') || 'Aktif'} options={[{ value: 'Aktif', label: 'Aktif' }, { value: 'Nonaktif', label: 'Nonaktif' }]} /><Field label="URL gambar" name="image_url" type="url" value={recordValue(record, 'image_url')} /></>;
}

function Field({ label, name, value, required = false, type = 'text', min, pattern }: { label: string; name: string; value: string; required?: boolean; type?: string; min?: string; pattern?: string }) {
    return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" defaultValue={value} min={min} name={name} pattern={pattern} required={required} type={type} /></label>;
}

function TextArea({ label, name, value }: { label: string; name: string; value: string }) {
    return <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" defaultValue={value} name={name} /></label>;
}

function Select({ label, name, value, options, placeholder, required = false }: { label: string; name: string; value: string; options: { value: string; label: string }[]; placeholder?: string; required?: boolean }) {
    return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" defaultValue={value} name={name} required={required}><option value="">{placeholder ?? 'Pilih opsi'}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
