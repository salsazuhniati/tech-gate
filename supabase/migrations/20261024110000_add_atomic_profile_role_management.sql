-- Diterapkan terpisah melalui workflow migrasi Supabase. Fungsi ini tidak
-- mengubah policy RLS profiles dan membuat penurunan admin terakhir atomik.
create function public.change_profile_role(p_target_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_role text;
    v_target_role text;
    v_admin_count integer;
begin
    if p_role is null or p_role not in ('admin', 'staff', 'manager') then
        raise exception 'Role pengguna tidak valid.' using errcode = '22023';
    end if;

    if auth.uid() is null then
        raise exception 'Sesi pengguna tidak tersedia.' using errcode = '42501';
    end if;

    -- Menyerialkan seluruh perubahan role yang melalui fungsi ini sampai
    -- transaksi selesai, termasuk saat belum ada lebih dari satu admin.
    perform pg_catalog.pg_advisory_xact_lock(51817002411000::bigint);

    select role into v_actor_role
    from public.profiles
    where user_id = auth.uid();

    if v_actor_role is distinct from 'admin' then
        raise exception 'Akses admin diperlukan.' using errcode = '42501';
    end if;

    if p_target_user_id = auth.uid() then
        raise exception 'Role akun sendiri tidak dapat diubah.' using errcode = 'P0001';
    end if;

    select role into v_target_role
    from public.profiles
    where user_id = p_target_user_id;

    if not found then
        raise exception 'Pengguna tidak ditemukan.' using errcode = 'P0001';
    end if;

    if v_target_role = 'admin' and p_role <> 'admin' then
        select count(*) into v_admin_count
        from public.profiles
        where role = 'admin';

        if v_admin_count <= 1 then
            raise exception 'Role admin terakhir tidak dapat diturunkan.' using errcode = 'P0001';
        end if;
    end if;

    update public.profiles
    set role = p_role
    where user_id = p_target_user_id;
end;
$$;

revoke all on function public.change_profile_role(uuid, text) from public;
grant execute on function public.change_profile_role(uuid, text) to authenticated;
