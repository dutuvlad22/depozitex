#!/bin/bash
# Deploy DepoziteX pe VPS (vlad.apps.couriermanager.com).
#
# Urca ultimul commit (nu fisierele nesalvate in git), il construieste intr-un
# folder nou pe server si abia daca build-ul reuseste comuta aplicatia pe el.
# Daca aplicatia noua nu porneste, revine automat la versiunea anterioara.
#
# Utilizare:  ./deploy.sh
set -euo pipefail

HOST=root@178.104.187.48
BASE=/root/projects
KEEP=3   # cate versiuni pastram pe server (pentru revenire rapida)

cd "$(dirname "$0")"

if [ -n "$(git status --porcelain)" ]; then
  echo "Ai modificari nesalvate in git. Fa commit inainte de deploy:"
  git status --short
  exit 1
fi

SHA=$(git rev-parse --short HEAD)
REL="$(date -u +%Y%m%d-%H%M%S)-$SHA"
echo "==> Deploy $SHA: $(git log -1 --format=%s)"

echo "==> Urc codul pe server"
git archive --format=tar HEAD | ssh "$HOST" "mkdir -p $BASE/depozitex-releases/$REL && tar -x -C $BASE/depozitex-releases/$REL"

ssh "$HOST" bash -s -- "$BASE" "$REL" "$SHA" "$KEEP" <<'REMOTE'
set -euo pipefail
BASE=$1; REL=$2; SHA=$3; KEEP=$4
DIR=$BASE/depozitex-releases/$REL
CUR=$BASE/depozitex
PREV=$(readlink -f "$CUR")

cd "$DIR"
echo "$SHA" > REVISION
ln -s "$BASE/depozitex-shared/.env.local" .env.local

echo "==> Instalez dependintele si construiesc (aplicatia curenta ruleaza in continuare)"
if ! { npm ci --no-audit --no-fund --loglevel=error && npm run build; } > build.log 2>&1; then
  tail -30 build.log
  rm -rf "$DIR"
  echo "!!! Build esuat. Nimic nu s-a schimbat pe server."
  exit 1
fi

echo "==> Comut pe versiunea noua si repornesc"
ln -sfn "$DIR" "$CUR"
systemctl restart depozitex

for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = 200 ]; then
    OK=1; break
  fi
  sleep 1
done

if [ -z "${OK:-}" ]; then
  echo "!!! Aplicatia noua nu raspunde. Revin la versiunea anterioara."
  journalctl -u depozitex -n 20 --no-pager -o cat || true
  ln -sfn "$PREV" "$CUR"
  systemctl restart depozitex
  exit 1
fi

# curatenie: pastram ultimele $KEEP versiuni
ls -1dt "$BASE"/depozitex-releases/*/ | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$(readlink -f "$old")" = "$(readlink -f "$CUR")" ] || rm -rf "$old"
done
REMOTE

echo "==> Gata: https://vlad.apps.couriermanager.com ruleaza $SHA"
