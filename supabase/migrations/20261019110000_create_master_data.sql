DO $$
BEGIN
    IF to_regclass('public.categories') IS NOT NULL
       OR to_regclass('public.suppliers') IS NOT NULL
       OR to_regclass('public.customers') IS NOT NULL
       OR to_regclass('public.products') IS NOT NULL
    THEN
        RAISE EXCEPTION
            'Tabel Master Data sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION
            'Tabel public.profiles belum tersedia.';
    END IF;
END;
$$;

-- 2. Fungsi pemeriksaan role pengguna.
-- SECURITY DEFINER diperlukan agar fungsi dapat memeriksa
-- profil tanpa bergantung pada kebijakan SELECT profil milik pengguna.
CREATE FUNCTION public.master_data_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.user_id = (SELECT auth.uid())
          AND p.role IN ('admin', 'staff', 'manager')
    );
$$;

REVOKE ALL ON FUNCTION public.master_data_access_allowed()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.master_data_access_allowed()
TO authenticated;

-- 3. Tabel Kategori.
CREATE TABLE public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_name_unique_ci
ON public.categories (lower(name));

-- 4. Tabel Supplier.
CREATE TABLE public.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
    contact_name text,
    phone text,
    email text,
    address text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT suppliers_email_format
        CHECK (
            email IS NULL
            OR btrim(email) = ''
            OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        ),

    CONSTRAINT suppliers_phone_format
        CHECK (
            phone IS NULL
            OR btrim(phone) = ''
            OR phone ~ '^[0-9+][0-9 ()-]{5,24}$'
        )
);

CREATE UNIQUE INDEX suppliers_name_unique_ci
ON public.suppliers (lower(name));

-- 5. Tabel Pelanggan.
CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
    phone text,
    email text,
    address text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT customers_email_format
        CHECK (
            email IS NULL
            OR btrim(email) = ''
            OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        ),

    CONSTRAINT customers_phone_format
        CHECK (
            phone IS NULL
            OR btrim(phone) = ''
            OR phone ~ '^[0-9+][0-9 ()-]{5,24}$'
        )
);

CREATE INDEX customers_name_index
ON public.customers (name);

CREATE INDEX customers_phone_index
ON public.customers (phone);

-- 6. Tabel Produk.
CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 255),
    sku text NOT NULL
        CHECK (char_length(btrim(sku)) BETWEEN 1 AND 50),

    category_id uuid NOT NULL
        REFERENCES public.categories (id) ON DELETE RESTRICT,

    supplier_id uuid
        REFERENCES public.suppliers (id) ON DELETE RESTRICT,

    purchase_price numeric(14, 2) NOT NULL DEFAULT 0
        CHECK (purchase_price >= 0),

    selling_price numeric(14, 2) NOT NULL DEFAULT 0
        CHECK (selling_price >= 0),

    stock integer NOT NULL DEFAULT 0
        CHECK (stock >= 0),

    minimum_stock integer NOT NULL DEFAULT 0
        CHECK (minimum_stock >= 0),

    unit text NOT NULL DEFAULT 'unit'
        CHECK (char_length(btrim(unit)) BETWEEN 1 AND 30),

    status text NOT NULL DEFAULT 'Aktif'
        CHECK (status IN ('Aktif', 'Nonaktif')),

    image_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT products_sku_unique UNIQUE (sku)
);

CREATE INDEX products_category_id_index
ON public.products (category_id);

CREATE INDEX products_supplier_id_index
ON public.products (supplier_id);

CREATE INDEX products_name_index
ON public.products (name);

-- 7. Fungsi pembaruan timestamp.
CREATE FUNCTION public.set_master_data_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- 8. Trigger pembaruan timestamp.
CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

CREATE TRIGGER suppliers_set_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

-- 9. Pastikan hak akses tabel hanya diberikan
-- kepada role authenticated yang memerlukan akses.
REVOKE ALL ON TABLE
    public.categories,
    public.suppliers,
    public.customers,
    public.products
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.categories,
    public.suppliers,
    public.customers,
    public.products
TO authenticated;

-- 10. Aktifkan Row Level Security.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 11. Kebijakan CRUD Kategori.
CREATE POLICY "Master data users can read categories"
ON public.categories FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can create categories"
ON public.categories FOR INSERT TO authenticated
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can update categories"
ON public.categories FOR UPDATE TO authenticated
USING ((SELECT public.master_data_access_allowed()))
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can delete categories"
ON public.categories FOR DELETE TO authenticated
USING ((SELECT public.master_data_access_allowed()));

-- 12. Kebijakan CRUD Supplier.
CREATE POLICY "Master data users can read suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can create suppliers"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can update suppliers"
ON public.suppliers FOR UPDATE TO authenticated
USING ((SELECT public.master_data_access_allowed()))
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can delete suppliers"
ON public.suppliers FOR DELETE TO authenticated
USING ((SELECT public.master_data_access_allowed()));

-- 13. Kebijakan CRUD Pelanggan.
CREATE POLICY "Master data users can read customers"
ON public.customers FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can create customers"
ON public.customers FOR INSERT TO authenticated
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can update customers"
ON public.customers FOR UPDATE TO authenticated
USING ((SELECT public.master_data_access_allowed()))
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can delete customers"
ON public.customers FOR DELETE TO authenticated
USING ((SELECT public.master_data_access_allowed()));

-- 14. Kebijakan CRUD Produk.
CREATE POLICY "Master data users can read products"
ON public.products FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can create products"
ON public.products FOR INSERT TO authenticated
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can update products"
ON public.products FOR UPDATE TO authenticated
USING ((SELECT public.master_data_access_allowed()))
WITH CHECK ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Master data users can delete products"
ON public.products FOR DELETE TO authenticated
USING ((SELECT public.master_data_access_allowed()));

-- Selesai: empat tabel Master Data beserta RLS dan trigger.
