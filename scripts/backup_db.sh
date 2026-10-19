#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_MOUNT:?ERROR: define BACKUP_MOUNT (punto de montaje que se comprobará)}"
: "${BACKUP_DIR:?ERROR: define BACKUP_DIR (directorio de destino de las copias)}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ARCHIVE="$BACKUP_DIR/pairbudget_$(date +%F_%H-%M-%S).dump"
TMP="$ARCHIVE.tmp"
trap 'rm -f "$TMP"' EXIT

mountpoint -q "$BACKUP_MOUNT" || { echo "ERROR: no está montado el punto indicado por BACKUP_MOUNT: $BACKUP_MOUNT" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP"
test -s "$TMP"
# pg_restore lee el archivo custom desde stdin al no recibir una ruta de archivo.
docker compose exec -T db pg_restore -l < "$TMP" > /dev/null
mv "$TMP" "$ARCHIVE"
echo "OK: $ARCHIVE"
