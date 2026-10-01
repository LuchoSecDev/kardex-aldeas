-- Clave de aprovisionamiento de PRUEBA (solo para el Postgres local desechable de tests/db).
-- Las pruebas crean comunidades con provision_community('clave-de-prueba', ...), igual que las
-- pruebas de integración contra Supabase usan la clave real de .env.local (PROVISION_KEY).
insert into community_provision_key (id, key_hash)
values (1, encode(sha256(convert_to('clave-de-prueba', 'UTF8')), 'hex'))
on conflict (id) do update set key_hash = excluded.key_hash;
