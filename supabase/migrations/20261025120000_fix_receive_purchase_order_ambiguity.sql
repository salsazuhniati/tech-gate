-- Koreksi fungsi penerimaan PO yang sudah ada. Tidak mengubah tabel, RLS, atau data.
-- Tinjau dan terapkan melalui workflow migrasi Supabase yang berlaku; jangan jalankan manual.

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
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

    SELECT bool_and(poi.quantity_received = poi.quantity_ordered)
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
