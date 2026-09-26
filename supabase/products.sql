-- Catálogo de productos del kardex. Antes vivía hardcodeado en
-- src/data/products.ts; ahora la app lo carga desde acá, y ese archivo
-- queda solo como respaldo (ver Fase 5 del plan de refactorización) por si
-- Supabase no responde.
--
-- Ejecutar una sola vez en el SQL Editor del proyecto de Supabase.

create table if not exists products (
  id text primary key,
  category text not null,
  name text not null,
  unit text not null,
  min_stock numeric not null default 5,
  sort_order int not null,
  is_active boolean not null default true
);

alter table products enable row level security;

-- Solo lectura para el anon key: todavía no existe un panel de
-- administración, así que no hay ninguna razón para permitir que la app
-- escriba en el catálogo. Doble capa (misma lección de kardex_records):
-- quitar el permiso a nivel de tabla Y no crear política de insert/update/delete.
revoke insert, update, delete on products from anon;

drop policy if exists "products anon select" on products;

create policy "products anon select" on products
  for select
  to anon
  using (is_active = true);

-- Migración de los 46 productos actuales de products.ts, con el mismo id
-- y el mismo orden (sort_order = posición original en el archivo).
insert into products (id, category, name, unit, min_stock, sort_order) values
  ('p1', 'CARNES, PESCADOS Y HUEVOS', 'Carne asar porcion', 'PAQUETE', 5, 1),
  ('p2', 'CARNES, PESCADOS Y HUEVOS', 'Carne sudar porcion', 'PAQUETE', 5, 2),
  ('p3', 'CARNES, PESCADOS Y HUEVOS', 'Carne sudar porcion x60gr', 'PAQUETE', 5, 3),
  ('p4', 'CARNES, PESCADOS Y HUEVOS', 'Costilla res t*180gr', 'PAQUETE', 5, 4),
  ('p5', 'CARNES, PESCADOS Y HUEVOS', 'Carne molida 90/10', 'PAQUETE', 5, 5),
  ('p6', 'CARNES, PESCADOS Y HUEVOS', 'Carne goulash', 'PAQUETE', 5, 6),
  ('p7', 'CARNES, PESCADOS Y HUEVOS', 'Carne desmechada (posta)', 'PAQUETE', 5, 7),
  ('p8', 'CARNES, PESCADOS Y HUEVOS', 'Sobrebarriga porcionada', 'PAQUETE', 5, 8),
  ('p9', 'CARNES, PESCADOS Y HUEVOS', 'Higado porcionado', 'PAQUETE', 5, 9),
  ('p10', 'CARNES, PESCADOS Y HUEVOS', 'Callo picado', 'PAQUETE', 5, 10),
  ('p11', 'CARNES, PESCADOS Y HUEVOS', 'Bofe', 'PAQUETE', 5, 11),
  ('p12', 'CARNES, PESCADOS Y HUEVOS', 'Cerdo pulpa porcionado', 'PAQUETE', 5, 12),
  ('p13', 'CARNES, PESCADOS Y HUEVOS', 'Costilla de cerdo', 'PAQUETE', 5, 13),
  ('p14', 'CARNES, PESCADOS Y HUEVOS', 'Molida de cerdo', 'PAQUETE', 5, 14),
  ('p15', 'CARNES, PESCADOS Y HUEVOS', 'Cerdo brazo juliana', 'PAQUETE', 5, 15),
  ('p16', 'CARNES, PESCADOS Y HUEVOS', 'Cerdo brazo goulash', 'PAQUETE', 5, 16),
  ('p17', 'CARNES, PESCADOS Y HUEVOS', 'Pechuga entera', 'PAQUETE', 5, 17),
  ('p18', 'CARNES, PESCADOS Y HUEVOS', 'Filete pechuga porcionada', 'PAQUETE', 5, 18),
  ('p19', 'CARNES, PESCADOS Y HUEVOS', 'Filete pechuga porcionada *60gr', 'PAQUETE', 5, 19),
  ('p20', 'CARNES, PESCADOS Y HUEVOS', 'Corazones de pollo', 'PAQUETE', 5, 20),
  ('p21', 'CARNES, PESCADOS Y HUEVOS', 'Colombiana pollo', 'PAQUETE', 5, 21),
  ('p22', 'CARNES, PESCADOS Y HUEVOS', 'Contramuslo pollo', 'PAQUETE', 5, 22),
  ('p23', 'CARNES, PESCADOS Y HUEVOS', 'Filete pescado', 'PAQUETE', 5, 23),
  ('p24', 'CARNES, PESCADOS Y HUEVOS', 'Pescado apanado', 'BANDEJA', 5, 24),
  ('p25', 'CARNES, PESCADOS Y HUEVOS', 'Hueso res poroso', 'KILOS', 5, 25),
  ('p26', 'CARNES, PESCADOS Y HUEVOS', 'Pata de res picada', 'KILOS', 5, 26),
  ('p27', 'CARNES, PESCADOS Y HUEVOS', 'Pezuña', 'KILOS', 5, 27),
  ('p28', 'CARNES, PESCADOS Y HUEVOS', 'Hamburguesa 100gr (evento)', 'UNIDAD', 5, 28),
  ('p29', 'CARNES, PESCADOS Y HUEVOS', 'Jamon sandwich (evento)', 'PAQUETE', 5, 29),
  ('p30', 'CARNES, PESCADOS Y HUEVOS', 'Salchichas perro (evento)', 'PAQUETE', 5, 30),
  ('p31', 'CARNES, PESCADOS Y HUEVOS', 'Chorizo *430gr (evento)', 'PAQUETE', 5, 31),
  ('p32', 'CARNES, PESCADOS Y HUEVOS', 'Huevos', 'UNIDAD', 5, 32),
  ('p33', 'LACTEOS', 'Leche descremada maxilitro', 'UNIDAD', 5, 33),
  ('p34', 'LACTEOS', 'Leche deslactosada maxilitro', 'UNIDAD', 5, 34),
  ('p35', 'LACTEOS', 'Leche larga vida maxilitro', 'UNIDAD', 5, 35),
  ('p36', 'LACTEOS', 'Kumis *1000ml', 'LITRO', 5, 36),
  ('p37', 'LACTEOS', 'Kumis *200ml', 'UNIDAD', 5, 37),
  ('p38', 'LACTEOS', 'Queso campesino', 'LIBRA', 5, 38),
  ('p39', 'LACTEOS', 'Queso costeño', 'LIBRA', 5, 39),
  ('p40', 'LACTEOS', 'Queso doble crema', 'LIBRA', 5, 40),
  ('p41', 'LACTEOS', 'Queso doble crema tajado', 'LIBRA', 5, 41),
  ('p42', 'LACTEOS', 'Yogurt griego (evento)', 'LITRO', 5, 42),
  ('p43', 'LACTEOS', 'Yogurt d1 (evento)', 'UNIDAD', 5, 43),
  ('p44', 'LACTEOS', 'Yogurt *1000ml', 'LITRO', 5, 44),
  ('p45', 'LACTEOS', 'Yogurt 200ml', 'UNIDAD', 5, 45),
  ('p46', 'LACTEOS', 'Crema leche', 'UNIDAD', 5, 46)
on conflict (id) do nothing;
