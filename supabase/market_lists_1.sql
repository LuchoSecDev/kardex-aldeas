-- Lista de mercado (plan 003, Fase A) — archivo 1 de 5: tablas.
-- Correr los 5 EN ORDEN (1 a 5) en el SQL Editor, después de week_submissions.sql, y luego
-- los market_seed_N.sql. Va en archivos chicos: el editor no deja pegar más de ~100 líneas.
-- Es seguro repetirlos. No hay precios (plan 003).

-- market_items: catálogo (solo nombre y unidad). market_calendar: qué se pide cada viernes y su plazo.
-- market_lists: una fila por (comunidad, semana, tipo); la semana es el LUNES de entrega (viernes + 3).
-- Estados de una lista (se calculan): borrador, enviada, modificada (editada después de enviar).
-- Todas con RLS y `revoke all` para anon: solo las funciones security definer las tocan.

-- Participantes: la columna NO entra en el `grant select` por columnas de
-- communities, así que el cliente solo la ve a través de market_list_load().
alter table communities add column if not exists participants int
  check (participants is null or participants between 1 and 500);

create table if not exists market_items (
  id         text primary key,
  kind       text not null check (kind in ('fruver', 'carnes', 'abarrotes', 'aseo')),
  name       text not null,
  unit       text not null,
  is_event   boolean not null default false,
  sort_order int  not null,
  is_active  boolean not null default true,
  unique (kind, sort_order)
);

create table if not exists market_calendar (
  friday      date primary key check (extract(isodow from friday) = 5),
  -- Tipos que se piden ese viernes. Fruver (incluye lácteos) y carnes van siempre.
  kinds       text[] not null check (kinds <@ array['fruver', 'carnes', 'abarrotes', 'aseo']),
  -- Hasta cuándo se puede enviar sin marcarse como tardía (normalmente viernes
  -- 5 pm hora de Bogotá; en viernes festivo, el día hábil anterior).
  deadline_at timestamptz not null
);

create table if not exists market_lists (
  id                     uuid primary key default gen_random_uuid(),
  community              text not null references communities(name) on delete cascade,
  week_start             date not null check (extract(isodow from week_start) = 1),
  kind                   text not null check (kind in ('fruver', 'carnes', 'abarrotes', 'aseo')),
  -- Copia de trabajo: {item_id: cantidad}, solo cantidades distintas de cero.
  quantities             jsonb not null default '{}'::jsonb,
  -- Lo último que se envió (lo que ve la nutricionista). Nulo = nunca enviada.
  sent_quantities        jsonb,
  -- Copia del número de participantes vigente al enviar.
  participants           int,
  first_submitted_at     timestamptz,
  submitted_at           timestamptz,
  submit_count           int not null default 0,
  -- Se juzga por el PRIMER envío: reenviar después no vuelve tardía una lista a tiempo.
  late                   boolean not null default false,
  -- Se reenvió con cambios después del plazo.
  changed_after_deadline boolean not null default false,
  reviewed_at            timestamptz,
  updated_at             timestamptz not null default now(),
  unique (community, week_start, kind)
);

alter table market_items    enable row level security;
alter table market_calendar enable row level security;
alter table market_lists    enable row level security;
revoke all on market_items    from anon, authenticated;
revoke all on market_calendar from anon, authenticated;
revoke all on market_lists    from anon, authenticated;
