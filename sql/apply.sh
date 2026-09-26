#!/bin/bash
# Aplica fisiere SQL pe baza de TEST sau de PRODUCTIE (Supabase pe VPS).
#
#   ./sql/apply.sh test sql/10_ceva.sql      # intai pe test
#   ./sql/apply.sh prod sql/10_ceva.sql      # apoi pe productie (cere confirmare + face backup)
#
# Se opreste la prima eroare. Fisierele se aplica in ordinea data.
set -euo pipefail

HOST=root@178.104.187.48

usage() { echo "Utilizare: $0 test|prod fisier.sql [fisier2.sql ...]"; exit 1; }

case "${1:-}" in
  test) DB=supabase-test-db ;;
  prod) DB=supabase-db ;;
  *) usage ;;
esac
TARGET=$1
shift
[ $# -gt 0 ] || usage

for f in "$@"; do
  [ -f "$f" ] || { echo "Nu exista fisierul: $f"; exit 1; }
done

if [ "$TARGET" = prod ]; then
  for f in "$@"; do
    [ "$(basename "$f")" = reset.sql ] && { echo "reset.sql sterge toate datele si nu se ruleaza pe productie."; exit 1; }
  done
  echo "ATENTIE: aplici pe PRODUCTIE (datele reale): $*"
  read -rp "Scrie 'da' ca sa continui: " answer
  [ "$answer" = da ] || { echo "Anulat."; exit 1; }
  echo "==> Backup inainte de modificare"
  ssh "$HOST" depozitex-backup
fi

for f in "$@"; do
  echo "==> $TARGET: $f"
  ssh "$HOST" "docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q" < "$f"
done

# PostgREST isi reincarca schema (tabele/functii noi devin vizibile in API)
ssh "$HOST" "docker exec $DB psql -U postgres -d postgres -qc \"notify pgrst, 'reload schema'\""
echo "==> Gata ($TARGET)"
