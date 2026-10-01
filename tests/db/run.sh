#!/usr/bin/env bash
# Pruebas de los scripts SQL contra un Postgres LOCAL y desechable (no toca
# Supabase). Sirve para verificar un .sql nuevo ANTES de correrlo en producción.
#
#   bash tests/db/run.sh            # crea la base, carga los .sql y corre tests/db/*.test.sql
#
# Requiere un servidor PostgreSQL 14+ y poder entrar con `psql` (por defecto
# como el usuario del sistema; cambia PGUSER/PGHOST/PGPORT si hace falta).
# Crea y borra la base `kardex_sqltest`.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=kardex_sqltest
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -X -q -v ON_ERROR_STOP=1"

dropdb --if-exists "$DB" >/dev/null
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

run() { echo "  · $1"; $PSQL -d "$DB" -f "$1" >/dev/null; }

echo "Cargando scripts (mismo orden que en producción)…"
run tests/db/bootstrap.sql
for f in communities community_pin pin_rate_limit products ajustes session_access \
         lock_down_direct_access lock_down_kardex_records_delete \
         admin_auth admin_read week_submissions admin_weekly_summary \
         six_weeks_1 six_weeks_2 six_weeks_3 six_weeks_4 six_weeks_5 perf_1 perf_2 \
         market_lists_1 market_lists_2 market_lists_3 market_lists_4 market_lists_5 \
         market_admin_1 market_admin_2 market_admin_3 market_admin_4 \
         fixed_communities lock_down_community_creation_1 lock_down_community_creation_2 change_pin; do
  run "supabase/$f.sql"
done

for f in supabase/market_seed_*.sql; do run "$f"; done

echo "Corriendo pruebas…"
status=0
for t in tests/db/*.test.sql; do
  echo "  · $t"
  if ! $PSQL -d "$DB" -f "$t" 2>&1 | grep -v '^$'; then status=1; fi
done
[ "$status" -eq 0 ] && echo "OK: todas las pruebas de SQL pasaron." || { echo "FALLÓ alguna prueba de SQL."; exit 1; }
