create table public.profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users (id) on delete cascade,
    name text not null default '',
    email text not null,
    role text not null default 'staff' check (role in ('admin', 'staff', 'manager')),
    phone text,
    created_at timestamptz not null default timezone('utc', now())
);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.profiles (user_id, name, email)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', ''),
        new.email
    );

    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
