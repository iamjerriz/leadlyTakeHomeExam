-- Inventory Reservation API — initial schema
-- Runnable as-is in the Supabase SQL Editor. Safe to re-run (idempotent creates).

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists items (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  total_quantity      integer not null check (total_quantity > 0),
  reserved_quantity   integer not null default 0 check (reserved_quantity >= 0),
  confirmed_quantity  integer not null default 0 check (confirmed_quantity >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Safety-net invariant: even if application logic had a bug, the DB itself
  -- refuses to let held+confirmed exceed total stock.
  constraint items_quantity_invariant check (reserved_quantity + confirmed_quantity <= total_quantity)
);

create table if not exists reservations (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items(id) on delete restrict,
  customer_id    text not null,
  quantity       integer not null check (quantity > 0),
  status         text not null default 'PENDING'
                   check (status in ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  confirmed_at   timestamptz,
  cancelled_at   timestamptz
);

create index if not exists idx_reservations_item_id           on reservations (item_id);
create index if not exists idx_reservations_status             on reservations (status);
create index if not exists idx_reservations_expires_at         on reservations (expires_at);
create index if not exists idx_reservations_status_expires_at  on reservations (status, expires_at);

-- ============================================================================
-- Functions
--
-- All stock-mutating operations are implemented as PL/pgSQL functions rather
-- than in application code. Each function call runs inside a single implicit
-- Postgres transaction, and every read-before-write path uses
-- `SELECT ... FOR UPDATE` to lock the relevant row, so concurrent overlapping
-- requests are serialized by Postgres itself instead of racing in Node.
-- Errors are raised as 'CODE: message' so the API layer can map them to the
-- right HTTP status without guessing.
-- ============================================================================

-- Reserve (hold) stock for a customer. Prevents overselling: the availability
-- check and the increment happen while the item row is locked, so two
-- concurrent reservations for the same item can never both succeed past the
-- limit.
create or replace function fn_reserve_stock(
  p_item_id uuid,
  p_customer_id text,
  p_quantity integer,
  p_ttl_minutes integer default 10
) returns reservations
language plpgsql
security definer
as $$
declare
  v_item items%rowtype;
  v_reservation reservations%rowtype;
  v_available integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'VALIDATION: quantity must be greater than 0';
  end if;

  if p_customer_id is null or length(trim(p_customer_id)) = 0 then
    raise exception 'VALIDATION: customer_id is required';
  end if;

  select * into v_item from items where id = p_item_id for update;

  if not found then
    raise exception 'NOT_FOUND: item % does not exist', p_item_id;
  end if;

  v_available := v_item.total_quantity - v_item.reserved_quantity - v_item.confirmed_quantity;

  if v_available < p_quantity then
    raise exception 'INSUFFICIENT_STOCK: only % unit(s) available for item %', v_available, p_item_id;
  end if;

  update items
    set reserved_quantity = reserved_quantity + p_quantity,
        updated_at = now()
    where id = p_item_id;

  insert into reservations (item_id, customer_id, quantity, status, expires_at)
    values (p_item_id, p_customer_id, p_quantity, 'PENDING', now() + make_interval(mins => p_ttl_minutes))
    returning * into v_reservation;

  return v_reservation;
end;
$$;

-- Confirm a reservation. Idempotent: confirming an already-CONFIRMED
-- reservation returns the same row without deducting again. A reservation
-- whose expiry has passed is lazily expired (releasing its hold) instead of
-- being confirmed.
create or replace function fn_confirm_reservation(
  p_reservation_id uuid
) returns reservations
language plpgsql
security definer
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'NOT_FOUND: reservation % does not exist', p_reservation_id;
  end if;

  if v_res.status = 'CONFIRMED' then
    return v_res;
  end if;

  if v_res.status = 'CANCELLED' then
    raise exception 'INVALID_STATE: reservation % is cancelled and cannot be confirmed', p_reservation_id;
  end if;

  if v_res.status = 'PENDING' and v_res.expires_at < now() then
    update reservations set status = 'EXPIRED' where id = p_reservation_id;
    update items set reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now()
      where id = v_res.item_id;
    raise exception 'INVALID_STATE: reservation % has expired and cannot be confirmed', p_reservation_id;
  end if;

  if v_res.status = 'EXPIRED' then
    raise exception 'INVALID_STATE: reservation % has expired and cannot be confirmed', p_reservation_id;
  end if;

  update items
    set reserved_quantity = reserved_quantity - v_res.quantity,
        confirmed_quantity = confirmed_quantity + v_res.quantity,
        updated_at = now()
    where id = v_res.item_id;

  update reservations
    set status = 'CONFIRMED', confirmed_at = now()
    where id = p_reservation_id
    returning * into v_res;

  return v_res;
end;
$$;

-- Cancel a pending reservation. Idempotent: cancelling an already-CANCELLED
-- or already-EXPIRED reservation returns the current row without releasing
-- quantity again. Cancelling a CONFIRMED reservation is rejected — confirmed
-- units are permanent deductions and must not increase availability.
create or replace function fn_cancel_reservation(
  p_reservation_id uuid
) returns reservations
language plpgsql
security definer
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'NOT_FOUND: reservation % does not exist', p_reservation_id;
  end if;

  if v_res.status = 'CANCELLED' or v_res.status = 'EXPIRED' then
    return v_res;
  end if;

  if v_res.status = 'CONFIRMED' then
    raise exception 'INVALID_STATE: reservation % is already confirmed and cannot be cancelled', p_reservation_id;
  end if;

  if v_res.expires_at < now() then
    update reservations set status = 'EXPIRED' where id = p_reservation_id;
    update items set reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now()
      where id = v_res.item_id;
    select * into v_res from reservations where id = p_reservation_id;
    return v_res;
  end if;

  update items
    set reserved_quantity = reserved_quantity - v_res.quantity,
        updated_at = now()
    where id = v_res.item_id;

  update reservations
    set status = 'CANCELLED', cancelled_at = now()
    where id = p_reservation_id
    returning * into v_res;

  return v_res;
end;
$$;

-- Sweep pending reservations whose expiry has passed, releasing their held
-- quantity back to availability. Each reservation is locked individually
-- (`FOR UPDATE`), so this can safely run concurrently with reserve/confirm/
-- cancel calls on the same items without losing updates.
create or replace function fn_expire_reservations()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id, item_id, quantity
    from reservations
    where status = 'PENDING' and expires_at < now()
    order by id
    for update
  loop
    update reservations set status = 'EXPIRED' where id = r.id;
    update items set reserved_quantity = reserved_quantity - r.quantity, updated_at = now()
      where id = r.item_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
