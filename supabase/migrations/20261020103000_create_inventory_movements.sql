-- Inventori dasar: ledger pergerakan stok dan RPC atomik.
-- File ini hanya disiapkan untuk ditinjau; jangan dijalankan sebelum disetujui.

DO $$
BEGIN
    IF to_regclass('public.inventory_movements') IS NOT NULL THEN
        RAISE EXCEPTION 'Tabel public.inventory_movements sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regclass('public.products') IS NULL THEN
        RAISE EXCEPTION 'Tabel public.products belum tersedia.';
    END IF;

    IF to_regprocedure('public.master_data_access_allowed()') IS NULL THEN
        RAISE EXCEPTION 'Fungsi public.master_data_access_allowed() belum tersedia.';
    END IF;
END;
$$;

CREATE TABLE public.inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
    movement_type text NOT NULL CHECK (movement_type IN ('stock_in', 'stock_out')),
    quantity integer NOT NULL CHECK (quantity > 0),
    stock_before integer NOT NULL CHECK (stock_before >= 0),
    stock_after integer NOT NULL CHECK (stock_after >= 0),
    notes text CHECK (notes IS NULL OR char_length(btrim(notes)) <= 500),
    created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_movements_product_created_at_index
ON public.inventory_movements (product_id, created_at DESC);

CREATE INDEX inventory_movements_created_at_index
ON public.inventory_movements (created_at DESC);

REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operational users can read inventory movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING ((SELECT public.master_data_access_allowed()));

CREATE FUNCTION public.record_inventory_movement(
    p_product_id uuid,
    p_movement_type text,
    p_quantity integer,
    p_notes text DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_stock_before integer;
    v_stock_after integer;
    v_movement public.inventory_movements;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT (SELECT public.master_data_access_allowed()) THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses untuk mencatat pergerakan inventori.'
            USING ERRCODE = '42501';
    END IF;

    IF p_movement_type IS NULL 
        OR p_movement_type NOT IN ('stock_in', 'stock_out') THEN
        RAISE EXCEPTION 'Jenis pergerakan stok tidak valid.' USING ERRCODE = '22023';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Kuantitas harus lebih besar dari nol.' USING ERRCODE = '22023';
    END IF;

    SELECT stock
    INTO v_stock_before
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produk tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;

    v_stock_after := v_stock_before + CASE WHEN p_movement_type = 'stock_in' THEN p_quantity ELSE -p_quantity END;

    IF v_stock_after < 0 THEN
        RAISE EXCEPTION 'Stok tidak mencukupi untuk stok keluar.' USING ERRCODE = '22003';
    END IF;

    UPDATE public.products
    SET stock = v_stock_after
    WHERE id = p_product_id;

    INSERT INTO public.inventory_movements (
        product_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        notes,
        created_by
    )
    VALUES (
        p_product_id,
        p_movement_type,
        p_quantity,
        v_stock_before,
        v_stock_after,
        NULLIF(btrim(p_notes), ''),
        (SELECT auth.uid())
    )
    RETURNING * INTO v_movement;

    RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid, text, integer, text) TO authenticated;
