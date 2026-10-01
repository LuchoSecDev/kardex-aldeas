-- Plan 005: las 8 comunidades fijas. Correr en el SQL Editor de Supabase ANTES del despliegue.
-- Es aditivo y se puede repetir: crea las que falten y solo pone PIN a las que no lo tienen.
-- Al final muestra una tabla con los PIN NUEVOS: se ven una sola vez (en la base solo queda el hash).
-- Anota esa tabla y entrégale a cada comunidad su PIN. Maná ya tiene el suyo y no cambia.
-- Si al final sale "No rows returned", esas comunidades YA tenían PIN (el script ya se corrió antes) y los PIN
-- no se pueden recuperar: para generar otros mira planes/005-comunidades-fijas.md, sección «PIN que no se vieron».

insert into communities (name) values
  ('Maná'), ('Fortaleza'), ('Shalom'), ('Renacer'),
  ('Casa Blanca'), ('Esmeralda'), ('Leones'), ('Primavera')
on conflict (name) do nothing;

with nuevos as (
  select name, lpad(((get_byte(b, 0) * 256 + get_byte(b, 1)) % 10000)::text, 4, '0') as pin
  from (select name, extensions.gen_random_bytes(2) as b from communities
         where pin_hash is null
           and name in ('Maná','Fortaleza','Shalom','Renacer','Casa Blanca','Esmeralda','Leones','Primavera')) s
), puestos as (
  update communities c
     set pin_hash = extensions.crypt(n.pin, extensions.gen_salt('bf'))
    from nuevos n
   where c.name = n.name
  returning c.name, n.pin
)
select name as comunidad, pin from puestos order by name;
