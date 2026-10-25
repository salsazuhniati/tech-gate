-- Keuangan dasar: ledger kas manual, referensi operasional opsional,
-- dan ringkasan arus kas. Penjualan maupun Purchase Order tidak akan
-- membuat transaksi kas secara otomatis.

DO $$
BEGIN
    IF to_regclass('public.finance_transactions') IS NOT NULL THEN
        RAISE EXCEPTION
            'Tabel public.finance_transactions sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regprocedure('public.finance_access_allowed()') IS NOT NULL
       OR to_regprocedure('public.record_finance_transaction(text,text,numeric,date,text,text,uuid,uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.get_finance_cash_summary(date,date)') IS NOT NULL THEN
        RAISE EXCEPTION
            'Fungsi Keuangan sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regclass('public.profiles') IS NULL
       OR to_regclass('public.sales') IS NULL
       OR to_regclass('public.purchase_orders') IS NULL
       OR to_regprocedure('public.set_master_data_updated_at()') IS NULL THEN
        RAISE EXCEPTION
            'Prasyarat profil, Penjualan, Purchase Order, atau fungsi timestamp belum tersedia.';
    END IF;
END;
$$;

-- Akses Keuangan mengikuti role pada navigasi aplikasi: admin dan manager.
CREATE FUNCTION public.finance_access_allowed()
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
          AND p.role IN ('admin', 'manager')
    );
$$;

CREATE TABLE public.finance_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type text NOT NULL
        CHECK (transaction_type IN ('cash_in', 'cash_out')),
    category text NOT NULL
        CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
    amount numeric(14, 2) NOT NULL
        CHECK (amount > 0),
    transaction_date date NOT NULL,
    payment_method text NOT NULL
        CHECK (char_length(btrim(payment_method)) BETWEEN 1 AND 50),
    description text
        CHECK (description IS NULL OR char_length(btrim(description)) <= 500),
    sale_id uuid REFERENCES public.sales (id) ON DELETE RESTRICT,
    purchase_order_id uuid REFERENCES public.purchase_orders (id) ON DELETE RESTRICT,
    idempotency_key uuid NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_transactions_one_operational_reference
        CHECK (num_nonnulls(sale_id, purchase_order_id) <= 1)
);

CREATE INDEX finance_transactions_date_index
ON public.finance_transactions (transaction_date DESC);

CREATE INDEX finance_transactions_type_date_index
ON public.finance_transactions (transaction_type, transaction_date DESC);

CREATE INDEX finance_transactions_sale_id_index
ON public.finance_transactions (sale_id)
WHERE sale_id IS NOT NULL;

CREATE INDEX finance_transactions_purchase_order_id_index
ON public.finance_transactions (purchase_order_id)
WHERE purchase_order_id IS NOT NULL;

CREATE TRIGGER finance_transactions_set_updated_at
BEFORE UPDATE ON public.finance_transactions
FOR EACH ROW
EXECUTE FUNCTION public.set_master_data_updated_at();

REVOKE ALL ON TABLE public.finance_transactions
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.finance_transactions TO authenticated;

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance users can read finance transactions"
ON public.finance_transactions FOR SELECT TO authenticated
USING ((SELECT public.finance_access_allowed()));

CREATE FUNCTION public.record_finance_transaction(
    p_transaction_type text,
    p_category text,
    p_amount numeric,
    p_transaction_date date,
    p_payment_method text,
    p_description text DEFAULT NULL,
    p_sale_id uuid DEFAULT NULL,
    p_purchase_order_id uuid DEFAULT NULL,
    p_idempotency_key uuid DEFAULT NULL
)
RETURNS public.finance_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_transaction public.finance_transactions;
    v_existing public.finance_transactions;
    v_category text;
    v_payment_method text;
    v_description text;
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR NOT (SELECT public.finance_access_allowed()) THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses untuk mencatat transaksi keuangan.'
            USING ERRCODE = '42501';
    END IF;

    IF p_transaction_type IS NULL
       OR p_transaction_type NOT IN ('cash_in', 'cash_out') THEN
        RAISE EXCEPTION 'Jenis transaksi keuangan tidak valid.'
            USING ERRCODE = '22023';
    END IF;

    v_category := NULLIF(btrim(p_category), '');
    IF v_category IS NULL OR char_length(v_category) > 100 THEN
        RAISE EXCEPTION 'Kategori wajib diisi dengan maksimal 100 karakter.'
            USING ERRCODE = '22023';
    END IF;

    IF p_amount IS NULL
       OR p_amount <= 0
       OR p_amount <> round(p_amount, 2)
       OR p_amount > 999999999999.99::numeric THEN
        RAISE EXCEPTION 'Nominal harus positif, maksimal dua desimal, dan berada dalam batas yang didukung.'
            USING ERRCODE = '22003';
    END IF;

    IF p_transaction_date IS NULL THEN
        RAISE EXCEPTION 'Tanggal transaksi wajib diisi.'
            USING ERRCODE = '22023';
    END IF;

    v_payment_method := NULLIF(btrim(p_payment_method), '');
    IF v_payment_method IS NULL OR char_length(v_payment_method) > 50 THEN
        RAISE EXCEPTION 'Metode pembayaran wajib diisi dengan maksimal 50 karakter.'
            USING ERRCODE = '22023';
    END IF;

    v_description := NULLIF(btrim(p_description), '');
    IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
        RAISE EXCEPTION 'Keterangan maksimal 500 karakter.'
            USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Kunci permintaan transaksi wajib diisi.'
            USING ERRCODE = '22023';
    END IF;

    IF p_sale_id IS NOT NULL AND p_purchase_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Referensi hanya dapat berupa Penjualan atau Purchase Order, bukan keduanya.'
            USING ERRCODE = '22023';
    END IF;

    IF p_sale_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id) THEN
        RAISE EXCEPTION 'Penjualan tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_purchase_order_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.purchase_orders WHERE id = p_purchase_order_id
       ) THEN
        RAISE EXCEPTION 'Purchase Order tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.finance_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing.created_by IS DISTINCT FROM (SELECT auth.uid())
           OR v_existing.transaction_type IS DISTINCT FROM p_transaction_type
           OR v_existing.category IS DISTINCT FROM v_category
           OR v_existing.amount IS DISTINCT FROM p_amount
           OR v_existing.transaction_date IS DISTINCT FROM p_transaction_date
           OR v_existing.payment_method IS DISTINCT FROM v_payment_method
           OR v_existing.description IS DISTINCT FROM v_description
           OR v_existing.sale_id IS DISTINCT FROM p_sale_id
           OR v_existing.purchase_order_id IS DISTINCT FROM p_purchase_order_id THEN
            RAISE EXCEPTION 'Kunci transaksi sudah digunakan untuk permintaan berbeda.'
                USING ERRCODE = '23505';
        END IF;

        RETURN v_existing;
    END IF;

    INSERT INTO public.finance_transactions (
        transaction_type,
        category,
        amount,
        transaction_date,
        payment_method,
        description,
        sale_id,
        purchase_order_id,
        idempotency_key,
        created_by
    )
    VALUES (
        p_transaction_type,
        v_category,
        p_amount,
        p_transaction_date,
        v_payment_method,
        v_description,
        p_sale_id,
        p_purchase_order_id,
        p_idempotency_key,
        (SELECT auth.uid())
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO v_transaction;

    IF v_transaction.id IS NULL THEN
        SELECT *
        INTO v_existing
        FROM public.finance_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing.created_by IS DISTINCT FROM (SELECT auth.uid())
           OR v_existing.transaction_type IS DISTINCT FROM p_transaction_type
           OR v_existing.category IS DISTINCT FROM v_category
           OR v_existing.amount IS DISTINCT FROM p_amount
           OR v_existing.transaction_date IS DISTINCT FROM p_transaction_date
           OR v_existing.payment_method IS DISTINCT FROM v_payment_method
           OR v_existing.description IS DISTINCT FROM v_description
           OR v_existing.sale_id IS DISTINCT FROM p_sale_id
           OR v_existing.purchase_order_id IS DISTINCT FROM p_purchase_order_id THEN
            RAISE EXCEPTION 'Kunci transaksi sudah digunakan untuk permintaan berbeda.'
                USING ERRCODE = '23505';
        END IF;

        RETURN v_existing;
    END IF;

    RETURN v_transaction;
END;
$$;

CREATE FUNCTION public.get_finance_cash_summary(
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    cash_in numeric,
    cash_out numeric,
    net_cash_flow numeric,
    transaction_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR NOT (SELECT public.finance_access_allowed()) THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses untuk melihat ringkasan keuangan.'
            USING ERRCODE = '42501';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
        RAISE EXCEPTION 'Rentang tanggal tidak valid.'
            USING ERRCODE = '22007';
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'cash_in'), 0)::numeric,
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'cash_out'), 0)::numeric,
        (
            COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'cash_in'), 0)
            - COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'cash_out'), 0)
        )::numeric,
        COUNT(*)::bigint
    FROM public.finance_transactions AS ft
    WHERE ft.transaction_date BETWEEN p_start_date AND p_end_date;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_access_allowed()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.record_finance_transaction(text,text,numeric,date,text,text,uuid,uuid,uuid),
    public.get_finance_cash_summary(date,date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finance_access_allowed()
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.record_finance_transaction(text,text,numeric,date,text,text,uuid,uuid,uuid),
    public.get_finance_cash_summary(date,date)
TO authenticated;
