-- Laporan: agregasi operasional read-only. Tidak ada tabel laporan maupun
-- trigger karena seluruh angka selalu dihitung dari data operasional terkini.

DO $$
BEGIN
    IF to_regprocedure('public.get_reports_summary(date,date)') IS NOT NULL THEN
        RAISE EXCEPTION
            'Fungsi Laporan sudah ada. Periksa skema sebelum migrasi.';
    END IF;

    IF to_regclass('public.sales') IS NULL
       OR to_regclass('public.inventory_movements') IS NULL
       OR to_regclass('public.purchase_orders') IS NULL
       OR to_regclass('public.finance_transactions') IS NULL
       OR to_regprocedure('public.finance_access_allowed()') IS NULL
       OR to_regprocedure('public.get_finance_cash_summary(date,date)') IS NULL THEN
        RAISE EXCEPTION
            'Prasyarat Penjualan, Inventori, Purchase Order, atau Keuangan belum tersedia.';
    END IF;
END;
$$;

-- Ringkasan ini tidak mencakup kas agar perhitungan arus kas tetap memakai
-- public.get_finance_cash_summary() sebagai satu sumber perhitungan Keuangan.
CREATE FUNCTION public.get_reports_summary(
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    sales_total numeric,
    sales_transaction_count bigint,
    inventory_movement_count bigint,
    stock_in_quantity bigint,
    stock_out_quantity bigint,
    purchase_order_count bigint,
    purchase_order_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL
       OR NOT (SELECT public.finance_access_allowed()) THEN
        RAISE EXCEPTION 'Anda tidak memiliki akses untuk melihat laporan.'
            USING ERRCODE = '42501';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
        RAISE EXCEPTION 'Rentang tanggal tidak valid.'
            USING ERRCODE = '22007';
    END IF;

    RETURN QUERY
    SELECT
        COALESCE((
            SELECT SUM(s.total)
            FROM public.sales AS s
            WHERE s.status = 'completed'
              AND s.created_at >= p_start_date::timestamptz
              AND s.created_at < (p_end_date + 1)::timestamptz
        ), 0)::numeric,
        COALESCE((
            SELECT COUNT(*)
            FROM public.sales AS s
            WHERE s.status = 'completed'
              AND s.created_at >= p_start_date::timestamptz
              AND s.created_at < (p_end_date + 1)::timestamptz
        ), 0)::bigint,
        COALESCE((
            SELECT COUNT(*)
            FROM public.inventory_movements AS im
            WHERE im.created_at >= p_start_date::timestamptz
              AND im.created_at < (p_end_date + 1)::timestamptz
        ), 0)::bigint,
        COALESCE((
            SELECT SUM(im.quantity)
            FROM public.inventory_movements AS im
            WHERE im.movement_type = 'stock_in'
              AND im.created_at >= p_start_date::timestamptz
              AND im.created_at < (p_end_date + 1)::timestamptz
        ), 0)::bigint,
        COALESCE((
            SELECT SUM(im.quantity)
            FROM public.inventory_movements AS im
            WHERE im.movement_type = 'stock_out'
              AND im.created_at >= p_start_date::timestamptz
              AND im.created_at < (p_end_date + 1)::timestamptz
        ), 0)::bigint,
        COALESCE((
            SELECT COUNT(*)
            FROM public.purchase_orders AS po
            WHERE po.order_date BETWEEN p_start_date AND p_end_date
        ), 0)::bigint,
        COALESCE((
            SELECT SUM(po.total)
            FROM public.purchase_orders AS po
            WHERE po.order_date BETWEEN p_start_date AND p_end_date
        ), 0)::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reports_summary(date,date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_reports_summary(date,date)
TO authenticated;
