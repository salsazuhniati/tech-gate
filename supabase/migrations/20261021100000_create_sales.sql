-- Penjualan: transaksi final, detail immutable, dan pengurangan stok atomik.
-- Migration ini bergantung pada profiles, master data, dan inventory_movements.

DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL
       OR to_regclass('public.sale_items') IS NOT NULL
    THEN
        RAISE EXCEPTION 'Tabel Penjualan sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regclass('public.products') IS NULL
       OR to_regclass('public.customers') IS NULL
       OR to_regclass('public.inventory_movements') IS NULL
       OR to_regprocedure('public.master_data_access_allowed()') IS NULL
    THEN
        RAISE EXCEPTION 'Prasyarat Master Data atau Inventori belum tersedia.';
    END IF;
END;
$$;

CREATE SEQUENCE public.sales_transaction_number_seq;

CREATE TABLE public.sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number text NOT NULL UNIQUE,
    customer_id uuid REFERENCES public.customers (id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'cancelled')),
    subtotal numeric(14, 2) NOT NULL DEFAULT 0
        CHECK (subtotal >= 0),
    total numeric(14, 2) NOT NULL DEFAULT 0
        CHECK (total >= 0),
    notes text CHECK (notes IS NULL OR char_length(btrim(notes)) <= 500),
    idempotency_key uuid NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_total_matches_subtotal CHECK (total = subtotal)
);

CREATE TABLE public.sale_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
    product_name text NOT NULL CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 255),
    product_sku text NOT NULL CHECK (char_length(btrim(product_sku)) BETWEEN 1 AND 50),
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal numeric(14, 2) NOT NULL CHECK (subtotal >= 0),
    CONSTRAINT sale_items_one_product_per_sale UNIQUE (sale_id, product_id),
    CONSTRAINT sale_items_subtotal_matches_price CHECK (subtotal = quantity * unit_price)
);

CREATE INDEX sales_created_at_index ON public.sales (created_at DESC);
CREATE INDEX sales_customer_id_index ON public.sales (customer_id);
CREATE INDEX sales_status_created_at_index ON public.sales (status, created_at DESC);
CREATE INDEX sale_items_product_id_index ON public.sale_items (product_id);

REVOKE ALL ON TABLE public.sales, public.sale_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sales, public.sale_items TO authenticated;
REVOKE ALL ON SEQUENCE public.sales_transaction_number_seq FROM PUBLIC, anon, authenticated;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operational users can read sales"
ON public.sales FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Operational users can read sale items"
ON public.sale_items FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE FUNCTION public.finalize_sale(
    p_customer_id uuid,
    p_items jsonb,
    p_notes text DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (sale_id uuid, transaction_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sale_id uuid;
    v_transaction_number text;
    v_existing_owner uuid;
    v_raw_item jsonb;
    v_validated_items jsonb := '[]'::jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_item record;
    v_product record;
    -- Tanpa typmod agar hasil perkalian/penjumlahan dapat diperiksa terlebih
    -- dahulu, bukan gagal saat assignment ke variabel numeric(14,2).
    v_subtotal numeric := 0;
    v_line_subtotal numeric;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.master_data_access_allowed()) THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses untuk mencatat penjualan.'
            USING ERRCODE = '42501';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Kunci permintaan transaksi wajib diisi.' USING ERRCODE = '22023';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Payload item penjualan harus berupa array JSON.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Penjualan harus memiliki minimal satu item.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) > 100 OR pg_column_size(p_items) > 65536 THEN
        RAISE EXCEPTION 'Payload item penjualan terlalu besar.' USING ERRCODE = '22023';
    END IF;

    IF p_notes IS NOT NULL AND char_length(btrim(p_notes)) > 500 THEN
        RAISE EXCEPTION 'Catatan maksimal 500 karakter.' USING ERRCODE = '22023';
    END IF;

    SELECT id, created_by, transaction_number
    INTO v_sale_id, v_existing_owner, v_transaction_number
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing_owner <> (SELECT auth.uid()) THEN
            RAISE EXCEPTION 'Kunci permintaan transaksi sudah digunakan.' USING ERRCODE = '23505';
        END IF;

        RETURN QUERY SELECT v_sale_id, v_transaction_number;
        RETURN;
    END IF;

    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers WHERE id = p_customer_id
    ) THEN
        RAISE EXCEPTION 'Pelanggan tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;

    -- Validasi setiap elemen sebelum UUID/kuantitas dikonversi. Ini mencegah
    -- cast implisit atas JSON arbitrer dan membatasi payload yang diproses.
    FOR v_raw_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_raw_item) <> 'object'
           OR NOT (v_raw_item ? 'product_id')
           OR NOT (v_raw_item ? 'quantity')
           OR jsonb_typeof(v_raw_item -> 'product_id') <> 'string'
           OR jsonb_typeof(v_raw_item -> 'quantity') <> 'number'
           OR NOT ((v_raw_item ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
           OR NOT ((v_raw_item ->> 'quantity') ~ '^[1-9][0-9]*$')
           OR char_length(v_raw_item ->> 'quantity') > 10
           OR (char_length(v_raw_item ->> 'quantity') = 10 AND (v_raw_item ->> 'quantity') > '2147483647')
        THEN
            RAISE EXCEPTION 'Setiap item harus berisi product_id UUID dan kuantitas bilangan bulat positif yang valid.'
                USING ERRCODE = '22023';
        END IF;

        v_product_id := (v_raw_item ->> 'product_id')::uuid;
        v_quantity := (v_raw_item ->> 'quantity')::integer;
        v_validated_items := v_validated_items || jsonb_build_array(
            jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity)
        );
    END LOOP;

    v_transaction_number := 'PJ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_transaction_number_seq')::text, 8, '0');

    INSERT INTO public.sales (transaction_number, customer_id, subtotal, total, notes, idempotency_key, created_by)
    VALUES (
        v_transaction_number,
        p_customer_id,
        0,
        0,
        NULLIF(btrim(p_notes), ''),
        p_idempotency_key,
        (SELECT auth.uid())
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_sale_id;

    IF v_sale_id IS NULL THEN
        SELECT id, created_by, transaction_number
        INTO v_sale_id, v_existing_owner, v_transaction_number
        FROM public.sales
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing_owner <> (SELECT auth.uid()) THEN
            RAISE EXCEPTION 'Kunci permintaan transaksi sudah digunakan.' USING ERRCODE = '23505';
        END IF;

        RETURN QUERY SELECT v_sale_id, v_transaction_number;
        RETURN;
    END IF;

    -- Produk digabung sebelum dikunci; urutan UUID tetap konsisten untuk semua transaksi.
    FOR v_item IN
        SELECT item.product_id, sum(item.quantity) AS quantity
        FROM jsonb_to_recordset(v_validated_items) AS item(product_id uuid, quantity integer)
        GROUP BY item.product_id
        ORDER BY item.product_id
    LOOP
        IF v_item.quantity > 2147483647 THEN
            RAISE EXCEPTION 'Kuantitas gabungan produk terlalu besar.' USING ERRCODE = '22003';
        END IF;

        SELECT id, name, sku, stock, selling_price, status
        INTO v_product
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produk tidak ditemukan.' USING ERRCODE = 'P0002';
        END IF;

        IF v_product.status IS DISTINCT FROM 'Aktif' THEN
            RAISE EXCEPTION 'Produk % tidak aktif.', v_product.sku USING ERRCODE = '22023';
        END IF;

        IF v_product.selling_price IS NULL
           OR v_product.selling_price < 0
           OR v_product.selling_price > 999999999999.99::numeric
        THEN
            RAISE EXCEPTION 'Harga jual produk % tidak dapat digunakan.', v_product.sku USING ERRCODE = '22003';
        END IF;

        IF v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Stok produk % tidak mencukupi.', v_product.sku USING ERRCODE = '22003';
        END IF;

        v_line_subtotal := round(v_item.quantity * v_product.selling_price, 2);
        IF v_line_subtotal > 999999999999.99::numeric
           OR v_subtotal + v_line_subtotal > 999999999999.99::numeric
        THEN
            RAISE EXCEPTION 'Total transaksi melebihi batas yang didukung.' USING ERRCODE = '22003';
        END IF;

        v_subtotal := v_subtotal + v_line_subtotal;

        UPDATE public.products
        SET stock = stock - v_item.quantity::integer
        WHERE id = v_product.id;

        INSERT INTO public.sale_items (
            sale_id, product_id, product_name, product_sku, quantity, unit_price, subtotal
        ) VALUES (
            v_sale_id, v_product.id, v_product.name, v_product.sku,
            v_item.quantity::integer, v_product.selling_price, v_line_subtotal
        );

        INSERT INTO public.inventory_movements (
            product_id, movement_type, quantity, stock_before, stock_after, notes, created_by
        ) VALUES (
            v_product.id, 'stock_out', v_item.quantity::integer, v_product.stock,
            v_product.stock - v_item.quantity::integer,
            'Penjualan ' || v_transaction_number,
            (SELECT auth.uid())
        );
    END LOOP;

    UPDATE public.sales
    SET subtotal = v_subtotal, total = v_subtotal
    WHERE id = v_sale_id;

    RETURN QUERY SELECT v_sale_id, v_transaction_number;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_sale(uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sale(uuid, jsonb, text, uuid) TO authenticated;

-- Digunakan UI hanya untuk memeriksa hasil request yang sebelumnya tidak
-- menerima respons. Transaksi hanya dapat dilihat oleh pembuatnya sendiri.
CREATE FUNCTION public.get_sale_by_idempotency_key(p_idempotency_key uuid)
RETURNS TABLE (sale_id uuid, transaction_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.id, s.transaction_number
    FROM public.sales AS s
    WHERE s.idempotency_key = p_idempotency_key
      AND s.created_by = (SELECT auth.uid())
      AND (SELECT public.master_data_access_allowed());
$$;

REVOKE ALL ON FUNCTION public.get_sale_by_idempotency_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_by_idempotency_key(uuid) TO authenticated;
