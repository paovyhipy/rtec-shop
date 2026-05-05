create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  book_id text unique,
  barcode text,
  book_name text not null,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  image_url text,
  lot_date date,
  price numeric(12,2) not null default 0 check (price >= 0),
  category text,
  semester text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique,
  full_name text not null,
  level text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  bill_no text,
  type text not null check (type in ('sale', 'stock_in', 'adjustment', 'delete')),
  barcode text,
  book_name text not null,
  qty integer not null check (qty > 0),
  student_id text,
  student_name text,
  level text,
  note text,
  department text,
  price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  staff_name text,
  payment_method text,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  barcode text,
  book_name text,
  detail text,
  staff_name text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_products_updated_at on public.products;
create trigger touch_products_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists touch_students_updated_at on public.students;
create trigger touch_students_updated_at
before update on public.students
for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
alter table public.students enable row level security;
alter table public.transactions enable row level security;
alter table public.logs enable row level security;

drop policy if exists "anon can read products" on public.products;
drop policy if exists "anon can write products" on public.products;
drop policy if exists "anon can read students" on public.students;
drop policy if exists "anon can write students" on public.students;
drop policy if exists "anon can read transactions" on public.transactions;
drop policy if exists "anon can write transactions" on public.transactions;
drop policy if exists "anon can update transactions" on public.transactions;
drop policy if exists "anon can delete transactions" on public.transactions;
drop policy if exists "anon can read logs" on public.logs;
drop policy if exists "anon can write logs" on public.logs;

create policy "anon can read products" on public.products for select to anon using (true);
create policy "anon can write products" on public.products for all to anon using (true) with check (true);
create policy "anon can read students" on public.students for select to anon using (true);
create policy "anon can write students" on public.students for all to anon using (true) with check (true);
create policy "anon can read transactions" on public.transactions for select to anon using (true);
create policy "anon can write transactions" on public.transactions for insert to anon with check (true);
create policy "anon can update transactions" on public.transactions for update to anon using (true) with check (true);
create policy "anon can delete transactions" on public.transactions for delete to anon using (true);
create policy "anon can read logs" on public.logs for select to anon using (true);
create policy "anon can write logs" on public.logs for insert to anon with check (true);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_barcode_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products drop constraint products_barcode_key;
  end if;

  alter table public.products alter column barcode drop not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_book_id_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_book_id_key unique (book_id);
  end if;
end $$;

insert into public.products (book_id, barcode, book_name, stock_qty, lot_date, price, category, semester)
values ('B001', '8850001', 'หนังสือเรียนวิทยาศาสตร์', 50, '2026-05-10', 150, 'วิชาสามัญ', 'ปวช.1')
on conflict (book_id) do nothing;

insert into public.students (student_id, full_name, level, department)
values ('7226', 'นางสาวประภาพรรณ ทั่งทอง', 'ปวช.1/1', 'การบัญชี')
on conflict (student_id) do nothing;
