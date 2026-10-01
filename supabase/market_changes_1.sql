-- Zona de cambios de la lista de mercado (plan 008, Fase A) — archivo 1 de 6: columnas y validación.
-- Correr los 6 EN ORDEN (1 a 6) en el SQL Editor, después de market_lists_*.sql y market_admin_*.sql.
-- Van en archivos chicos: el editor no deja pegar más de ~100 líneas. Es seguro repetirlos.
--
-- Cada lista (comunidad + semana + tipo) puede llevar hasta 20 notas de cambio, p. ej. «pescado por pechuga».
-- Una nota: {id, item_id (producto del mismo tipo, o null), text (1 a 200 caracteres), at}.
-- changes = copia de trabajo; sent_changes = lo último que se envió (lo que ve la nutricionista).

alter table market_lists add column if not exists changes      jsonb not null default '[]'::jsonb;
alter table market_lists add column if not exists sent_changes jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'market_lists_changes_check') then
    alter table market_lists add constraint market_lists_changes_check check (
      jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) <= 20
      and jsonb_typeof(sent_changes) = 'array' and jsonb_array_length(sent_changes) <= 20);
  end if;
end $$;

-- Valida y limpia las notas de un tipo: arreglo de hasta 20 objetos con id único, texto de 1 a 200
-- caracteres (los saltos de línea y espacios repetidos se juntan en uno) y producto activo de ESE tipo
-- (o null). La fecha `at` la pone el servidor y se conserva en las notas que ya existían.
create or replace function _market_clean_changes(p_kind text, p_changes jsonb, p_current jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_e     jsonb;
  v_id    text;
  v_item  text;
  v_text  text;
  v_at    text;
  v_ids   text[] := '{}';
  v_clean jsonb := '[]'::jsonb;
begin
  if p_kind is null or p_kind not in ('fruver', 'carnes', 'abarrotes', 'aseo') then
    raise exception 'Tipo de lista inválido';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Cambios inválidos';
  end if;
  if jsonb_array_length(p_changes) > 20 then
    raise exception 'DEMASIADOS_CAMBIOS';
  end if;

  for v_e in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e -> 'text') is distinct from 'string' then
      raise exception 'Cambios inválidos';
    end if;
    v_id := v_e ->> 'id';
    if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' or v_id = any(v_ids) then
      raise exception 'Cambios inválidos';
    end if;
    v_ids := v_ids || v_id;

    v_item := v_e ->> 'item_id';
    if v_item is not null and not exists (
      select 1 from market_items i where i.id = v_item and i.kind = p_kind and i.is_active
    ) then
      raise exception 'Producto inválido';
    end if;

    v_text := btrim(regexp_replace(v_e ->> 'text', '\s+', ' ', 'g'));
    if char_length(v_text) not between 1 and 200 then
      raise exception 'Cambios inválidos';
    end if;

    select e ->> 'at' into v_at
      from jsonb_array_elements(coalesce(p_current, '[]'::jsonb)) e
     where e ->> 'id' = v_id
     limit 1;

    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'item_id', v_item, 'text', v_text,
      'at', coalesce(v_at, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  end loop;

  return v_clean;
end;
$$;

revoke execute on function _market_clean_changes(text, jsonb, jsonb) from public, anon, authenticated;
