
-- Purchase Order: draft terkelola, penerimaan atomik, dan ledger stok.
-- Jalankan hanya jika prasyarat Master Data dan Inventori sudah tersedia
-- dan migration Purchase Order ini belum pernah berhasil dijalankan.

DO $$
BEGIN
    IF to_regclass('public.purchase_orders') IS NOT NULL
       OR to_regclass('public.purchase_order_items') IS NOT NULL
       OR to_regclass('public.purchase_order_receipts') IS NOT NULL
       OR to_regclass('public.purchase_order_receipt_items') IS NOT NULL
       OR to_regclass('public.purchase_order_number_seq') IS NOT NULL THEN
        RAISE EXCEPTION
            'Objek Purchase Order sudah ada. Periksa database sebelum migrasi.';
    END IF;

    IF to_regprocedure('public.assert_purchase_order_access()') IS NOT NULL
       OR to_regprocedure('public.save_purchase_order(uuid,uuid,date,text,jsonb)') IS NOT NULL
       OR to_regprocedure('public.order_purchase_order(uuid)') IS NOT NULL
       OR to_regprocedure('public.cancel_purchase_order(uuid)') IS NOT NULL
       OR to_regprocedure('public.receive_purchase_order(uuid,jsonb,text,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION
            'Fungsi Purchase Order sudah ada. Periksa database sebelum migrasi.';
    END IF;

    IF to_regclass('public.suppliers') IS NULL
       OR to_regclass('public.products') IS NULL
       OR to_regclass('public.inventory_movements') IS NULL
       OR to_regprocedure('public.master_data_access_allowed()') IS NULL
       OR to_regprocedure('public.set_master_data_updated_at()') IS NULL THEN
        RAISE EXCEPTION
            'Prasyarat Master Data atau Inventori belum tersedia.';
    END IF;
END;
$$;

CREATE SEQUENCE public.purchase_order_number_seq;

CREATE TABLE public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number text NOT NULL UNIQUE,
    supplier_id uuid NOT NULL
        REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    order_date date NOT NULL DEFAULT current_date,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'ordered', 'partially_received',
            'received', 'cancelled'
        )),
    subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    notes text CHECK (
        notes IS NULL OR char_length(btrim(notes)) <= 500
    ),
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchase_orders_total_matches_subtotal
        CHECK (total = subtotal)
);

CREATE TABLE public.purchase_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid NOT NULL
        REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL
        REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name text NOT NULL
        CHECK (char_length(btrim(product_name)) BETWEEN 1 AND 255),
    product_sku text NOT NULL
        CHECK (char_length(btrim(product_sku)) BETWEEN 1 AND 50),
    purchase_price numeric(14,2) NOT NULL
        CHECK (purchase_price >= 0),
    quantity_ordered integer NOT NULL CHECK (quantity_ordered > 0),
    quantity_received integer NOT NULL DEFAULT 0
        CHECK (
            quantity_received >= 0
            AND quantity_received <= quantity_ordered
        ),
    subtotal numeric(14,2) NOT NULL
        CHECK (subtotal = quantity_ordered * purchase_price),
    CONSTRAINT purchase_order_items_one_product
        UNIQUE (purchase_order_id, product_id)
);

CREATE TABLE public.purchase_order_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid NOT NULL
        REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
    idempotency_key uuid NOT NULL UNIQUE,
    request_payload jsonb NOT NULL,
    notes text CHECK (
        notes IS NULL OR char_length(btrim(notes)) <= 500
    ),
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_order_receipt_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL
        REFERENCES public.purchase_order_receipts(id) ON DELETE CASCADE,
    purchase_order_item_id uuid NOT NULL
        REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity > 0),
    CONSTRAINT purchase_order_receipt_items_once
        UNIQUE (receipt_id, purchase_order_item_id)
);

CREATE INDEX purchase_orders_created_at_index
    ON public.purchase_orders(created_at DESC);
CREATE INDEX purchase_orders_supplier_id_index
    ON public.purchase_orders(supplier_id);
CREATE INDEX purchase_orders_status_created_at_index
    ON public.purchase_orders(status, created_at DESC);
CREATE INDEX purchase_order_items_product_id_index
    ON public.purchase_order_items(product_id);
CREATE INDEX purchase_order_receipts_order_id_index
    ON public.purchase_order_receipts(purchase_order_id, created_at DESC);

CREATE TRIGGER purchase_orders_set_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

REVOKE ALL ON TABLE
    public.purchase_orders,
    public.purchase_order_items,
    public.purchase_order_receipts,
    public.purchase_order_receipt_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
    public.purchase_orders,
    public.purchase_order_items,
    public.purchase_order_receipts,
    public.purchase_order_receipt_items
TO authenticated;

REVOKE ALL ON SEQUENCE public.purchase_order_number_seq
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operational users can read purchase orders"
ON public.purchase_orders FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Operational users can read purchase order items"
ON public.purchase_order_items FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Operational users can read purchase order receipts"
ON public.purchase_order_receipts FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE POLICY "Operational users can read purchase order receipt items"
ON public.purchase_order_receipt_items FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE FUNCTION public.assert_purchase_order_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR NOT (SELECT public.master_data_access_allowed()) THEN
        RAISE EXCEPTION
            'Anda tidak memiliki akses untuk mengelola Purchase Order.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE FUNCTION public.save_purchase_order(
    p_purchase_order_id uuid,
    p_supplier_id uuid,
    p_order_date date,
    p_notes text,
    p_items jsonb
)
RETURNS TABLE(purchase_order_id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id uuid;
    v_number text;
    v_raw jsonb;
    v_product record;
    v_product_id uuid;
    v_qty integer;
    v_price numeric;
    v_total numeric := 0;
    v_line numeric;
    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_quantity_text text;
    v_price_text text;
BEGIN
    PERFORM public.assert_purchase_order_access();

    IF p_supplier_id IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM public.suppliers WHERE id = p_supplier_id
       ) THEN
        RAISE EXCEPTION 'Supplier tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_order_date IS NULL THEN
        RAISE EXCEPTION 'Tanggal PO wajib diisi.'
            USING ERRCODE = '22023';
    END IF;

    IF p_notes IS NOT NULL
       AND char_length(btrim(p_notes)) > 500 THEN
        RAISE EXCEPTION 'Catatan maksimal 500 karakter.'
            USING ERRCODE = '22023';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Item PO harus berupa array JSON.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 100
       OR pg_column_size(p_items) > 65536 THEN
        RAISE EXCEPTION 'PO harus memiliki 1 sampai 100 item.'
            USING ERRCODE = '22023';
    END IF;

    IF p_purchase_order_id IS NULL THEN
        v_number := 'PO-' || to_char(now(), 'YYYYMMDD') || '-'
            || lpad(
                nextval('public.purchase_order_number_seq')::text,
                8, '0'
            );

        INSERT INTO public.purchase_orders (
            order_number, supplier_id, order_date, notes, created_by
        )
        VALUES (
            v_number, p_supplier_id, p_order_date,
            NULLIF(btrim(p_notes), ''), (SELECT auth.uid())
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT po.id, po.order_number
        INTO v_id, v_number
        FROM public.purchase_orders po
        WHERE po.id = p_purchase_order_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Purchase Order tidak ditemukan.'
                USING ERRCODE = 'P0002';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = v_id AND po.status = 'draft'
        ) THEN
            RAISE EXCEPTION 'Hanya PO draft yang dapat diubah.'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.purchase_orders
        SET supplier_id = p_supplier_id,
            order_date = p_order_date,
            notes = NULLIF(btrim(p_notes), '')
        WHERE id = v_id;

        DELETE FROM public.purchase_order_items
        WHERE purchase_order_id = v_id;
    END IF;

    FOR v_raw IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_raw) <> 'object'
           OR jsonb_typeof(v_raw->'product_id') <> 'string'
           OR jsonb_typeof(v_raw->'quantity') <> 'number'
           OR jsonb_typeof(v_raw->'purchase_price') <> 'number' THEN
            RAISE EXCEPTION 'Item PO tidak valid.'
                USING ERRCODE = '22023';
        END IF;

        v_quantity_text := v_raw->>'quantity';
        v_price_text := v_raw->>'purchase_price';

        IF NOT ((v_raw->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
           OR NOT (v_quantity_text ~ '^[1-9][0-9]*$')
           OR length(v_quantity_text) > 10
           OR (length(v_quantity_text) = 10 AND v_quantity_text > '2147483647')
           OR NOT (v_price_text ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$') THEN
            RAISE EXCEPTION 'Item PO tidak valid.'
                USING ERRCODE = '22023';
        END IF;

        v_product_id := (v_raw->>'product_id')::uuid;
        v_qty := v_quantity_text::integer;
        v_price := v_price_text::numeric;

        IF v_product_id = ANY(v_product_ids) THEN
            RAISE EXCEPTION 'Satu produk hanya boleh muncul sekali dalam PO.'
                USING ERRCODE = '22023';
        END IF;
        v_product_ids := array_append(v_product_ids, v_product_id);

        SELECT p.id, p.name, p.sku, p.status
        INTO v_product
        FROM public.products p
        WHERE p.id = v_product_id;

        IF NOT FOUND OR v_product.status <> 'Aktif' THEN
            RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif.'
                USING ERRCODE = 'P0002';
        END IF;

        v_line := v_qty * v_price;

        IF v_line > 999999999999.99::numeric
           OR v_total + v_line > 999999999999.99::numeric THEN
            RAISE EXCEPTION 'Total PO melebihi batas.'
                USING ERRCODE = '22003';
        END IF;

        INSERT INTO public.purchase_order_items (
            purchase_order_id, product_id, product_name, product_sku,
            purchase_price, quantity_ordered, subtotal
        )
        VALUES (
            v_id, v_product.id, v_product.name, v_product.sku,
            v_price, v_qty, v_line
        );

        v_total := v_total + v_line;
    END LOOP;

    UPDATE public.purchase_orders
    SET subtotal = v_total, total = v_total
    WHERE id = v_id;

    RETURN QUERY SELECT v_id, v_number;
END;
$$;

CREATE FUNCTION public.order_purchase_order(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.assert_purchase_order_access();

    UPDATE public.purchase_orders
    SET status = 'ordered'
    WHERE id = p_purchase_order_id AND status = 'draft';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hanya PO draft yang dapat dipesan.'
            USING ERRCODE = '22023';
    END IF;
END;
$$;

CREATE FUNCTION public.cancel_purchase_order(p_purchase_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.assert_purchase_order_access();

    UPDATE public.purchase_orders
    SET status = 'cancelled'
    WHERE id = p_purchase_order_id AND status = 'draft';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hanya PO draft yang dapat dibatalkan.'
            USING ERRCODE = '22023';
    END IF;
END;
$$;

CREATE FUNCTION public.receive_purchase_order(
    p_purchase_order_id uuid,
    p_items jsonb,
    p_notes text DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE(receipt_id uuid, purchase_order_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_receipt uuid;
    v_owner uuid;
    v_existing_order uuid;
    v_existing_payload jsonb;
    v_payload jsonb;
    v_order record;
    v_raw jsonb;
    v_item record;
    v_item_id uuid;
    v_qty integer;
    v_stock integer;
    v_received_all boolean;
    v_item_ids uuid[] := ARRAY[]::uuid[];
    v_quantity_text text;
BEGIN
    PERFORM public.assert_purchase_order_access();

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Kunci penerimaan wajib diisi.'
            USING ERRCODE = '22023';
    END IF;

    IF p_purchase_order_id IS NULL
       OR p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Data penerimaan harus berisi array item.'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_items) = 0
       OR jsonb_array_length(p_items) > 100
       OR pg_column_size(p_items) > 65536 THEN
        RAISE EXCEPTION 'Data penerimaan tidak valid.'
            USING ERRCODE = '22023';
    END IF;

    IF p_notes IS NOT NULL
       AND char_length(btrim(p_notes)) > 500 THEN
        RAISE EXCEPTION 'Catatan maksimal 500 karakter.'
            USING ERRCODE = '22023';
    END IF;

    v_payload := jsonb_build_object(
        'purchase_order_id', p_purchase_order_id,
        'items', p_items,
        'notes', NULLIF(btrim(p_notes), '')
    );

    SELECT r.id, r.created_by, r.purchase_order_id, r.request_payload
    INTO v_receipt, v_owner, v_existing_order, v_existing_payload
    FROM public.purchase_order_receipts r
    WHERE r.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_owner IS DISTINCT FROM (SELECT auth.uid())
           OR v_existing_order IS DISTINCT FROM p_purchase_order_id
           OR v_existing_payload IS DISTINCT FROM v_payload THEN
            RAISE EXCEPTION
                'Kunci penerimaan sudah digunakan untuk permintaan berbeda.'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT v_receipt, v_existing_order, po.status
        FROM public.purchase_orders po
        WHERE po.id = v_existing_order;

        RETURN;
    END IF;

    SELECT *
    INTO v_order
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_order.status NOT IN ('ordered', 'partially_received') THEN
        RAISE EXCEPTION 'PO ini tidak dapat menerima barang.'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.purchase_order_receipts (
        purchase_order_id, idempotency_key, request_payload,
        notes, created_by
    )
    VALUES (
        p_purchase_order_id, p_idempotency_key, v_payload,
        NULLIF(btrim(p_notes), ''), (SELECT auth.uid())
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_receipt;

    IF v_receipt IS NULL THEN
        SELECT r.id, r.created_by, r.purchase_order_id, r.request_payload
        INTO v_receipt, v_owner, v_existing_order, v_existing_payload
        FROM public.purchase_order_receipts r
        WHERE r.idempotency_key = p_idempotency_key;

        IF v_owner IS DISTINCT FROM (SELECT auth.uid())
           OR v_existing_order IS DISTINCT FROM p_purchase_order_id
           OR v_existing_payload IS DISTINCT FROM v_payload THEN
            RAISE EXCEPTION
                'Kunci penerimaan sudah digunakan untuk permintaan berbeda.'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT v_receipt, v_existing_order, po.status
        FROM public.purchase_orders po
        WHERE po.id = v_existing_order;

        RETURN;
    END IF;

    FOR v_raw IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_raw) <> 'object'
           OR jsonb_typeof(v_raw->'purchase_order_item_id') <> 'string'
           OR jsonb_typeof(v_raw->'quantity') <> 'number' THEN
            RAISE EXCEPTION 'Item penerimaan tidak valid.'
                USING ERRCODE = '22023';
        END IF;

        v_quantity_text := v_raw->>'quantity';

        IF NOT ((v_raw->>'purchase_order_item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
           OR NOT (v_quantity_text ~ '^[1-9][0-9]*$')
           OR length(v_quantity_text) > 10
           OR (length(v_quantity_text) = 10 AND v_quantity_text > '2147483647') THEN
            RAISE EXCEPTION 'Item penerimaan tidak valid.'
                USING ERRCODE = '22023';
        END IF;

        v_item_id := (v_raw->>'purchase_order_item_id')::uuid;
        v_qty := v_quantity_text::integer;

        IF v_item_id = ANY(v_item_ids) THEN
            RAISE EXCEPTION 'Satu item PO hanya boleh diterima sekali per permintaan.'
                USING ERRCODE = '22023';
        END IF;
        v_item_ids := array_append(v_item_ids, v_item_id);

        SELECT poi.*, p.stock
        INTO v_item
        FROM public.purchase_order_items poi
        JOIN public.products p ON p.id = poi.product_id
        WHERE poi.id = v_item_id
          AND poi.purchase_order_id = p_purchase_order_id
        FOR UPDATE OF poi, p;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item PO tidak ditemukan.'
                USING ERRCODE = 'P0002';
        END IF;

        IF v_qty > v_item.quantity_ordered - v_item.quantity_received THEN
            RAISE EXCEPTION 'Kuantitas diterima melebihi sisa pesanan.'
                USING ERRCODE = '22003';
        END IF;

        IF v_item.stock < 0
           OR v_item.stock > 2147483647 - v_qty THEN
            RAISE EXCEPTION 'Stok melebihi batas integer.'
                USING ERRCODE = '22003';
        END IF;

        INSERT INTO public.purchase_order_receipt_items (
            receipt_id, purchase_order_item_id, quantity
        )
        VALUES (v_receipt, v_item_id, v_qty);

        v_stock := v_item.stock;

        UPDATE public.products
        SET stock = stock + v_qty
        WHERE id = v_item.product_id;

        UPDATE public.purchase_order_items
        SET quantity_received = quantity_received + v_qty
        WHERE id = v_item_id;

        INSERT INTO public.inventory_movements (
            product_id, movement_type, quantity,
            stock_before, stock_after, notes, created_by
        )
        VALUES (
            v_item.product_id, 'stock_in', v_qty,
            v_stock, v_stock + v_qty,
            'Penerimaan ' || v_order.order_number,
            (SELECT auth.uid())
        );
    END LOOP;

    SELECT bool_and(quantity_received = quantity_ordered)
    INTO v_received_all
    FROM public.purchase_order_items AS poi
    WHERE poi.purchase_order_id = p_purchase_order_id;

    UPDATE public.purchase_orders AS po
    SET status = CASE
        WHEN v_received_all THEN 'received'
        ELSE 'partially_received'
    END
    WHERE po.id = p_purchase_order_id
    RETURNING po.status INTO status;

    receipt_id := v_receipt;
    purchase_order_id := p_purchase_order_id;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION
    public.assert_purchase_order_access()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.save_purchase_order(uuid,uuid,date,text,jsonb),
    public.order_purchase_order(uuid),
    public.cancel_purchase_order(uuid),
    public.receive_purchase_order(uuid,jsonb,text,uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.save_purchase_order(uuid,uuid,date,text,jsonb),
    public.order_purchase_order(uuid),
    public.cancel_purchase_order(uuid),
    public.receive_purchase_order(uuid,jsonb,text,uuid)
TO authenticated;
