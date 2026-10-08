#!/usr/bin/env bash
# Backup/restore drill: dump a database with pg_dump, restore it into an empty
# database with pg_restore, and prove the copy is complete and usable.
#
#   SOURCE_DATABASE_URL=postgresql://…/velora_drill_test \
#   RESTORE_DATABASE_URL=postgresql://…/velora_restore_test \
#   scripts/db/restore-drill.sh
#
# The restore target must be a disposable database whose name ends in _test
# (it is dropped and recreated). Run it in CI on seeded data, and periodically
# against a copy of a real backup — a backup is only proven by a restore.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL}"

target_db="${RESTORE_DATABASE_URL##*/}"
target_db="${target_db%%\?*}"
if [[ ! "$target_db" =~ _test$ ]]; then
  echo "Refusing to overwrite '$target_db': the restore target must end in _test." >&2
  exit 2
fi
admin_url="${RESTORE_DATABASE_URL%/*}/postgres"
dump_file="$(mktemp -d)/velora.dump"

echo "[drill] pg_dump $(pg_dump --version | awk '{print $NF}') → $dump_file"
pg_dump --format=custom --no-owner --no-acl --file="$dump_file" "$SOURCE_DATABASE_URL"
echo "[drill] dump size: $(du -h "$dump_file" | cut -f1)"

psql "$admin_url" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$target_db\"" -c "CREATE DATABASE \"$target_db\""
pg_restore --no-owner --no-acl --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$dump_file"
echo "[drill] restored into $target_db"

count() { psql "$1" -v ON_ERROR_STOP=1 -At -c "$2"; }

failures=0
for table in users addresses products product_variants inventory inventory_transactions \
  orders order_items payments refunds shipments return_requests reviews coupons \
  audit_logs outbox_events settings _prisma_migrations; do
  source_rows="$(count "$SOURCE_DATABASE_URL" "SELECT count(*) FROM \"$table\"")"
  restored_rows="$(count "$RESTORE_DATABASE_URL" "SELECT count(*) FROM \"$table\"")"
  if [[ "$source_rows" != "$restored_rows" ]]; then
    echo "[drill] ✗ $table: $source_rows rows in the source, $restored_rows restored" >&2
    failures=$((failures + 1))
  else
    printf '[drill] ✓ %-24s %s rows\n' "$table" "$restored_rows"
  fi
done

# Business invariants survive the round trip.
stock_ledger_mismatch="$(count "$RESTORE_DATABASE_URL" "
  SELECT count(*) FROM inventory i
  WHERE i.on_hand <> COALESCE((SELECT sum(t.quantity_delta) FROM inventory_transactions t
                                WHERE t.variant_id = i.variant_id), 0)")"
if [[ "$stock_ledger_mismatch" != "0" ]]; then
  echo "[drill] ✗ $stock_ledger_mismatch variants whose stock no longer matches the ledger" >&2
  failures=$((failures + 1))
else
  echo "[drill] ✓ stock on hand matches the inventory ledger"
fi

# Database-level protections are restored with the data (triggers, constraints, sequences).
if psql "$RESTORE_DATABASE_URL" -q -c "UPDATE audit_logs SET action = action WHERE id IN (SELECT id FROM audit_logs LIMIT 1)" 2>/dev/null; then
  if [[ "$(count "$RESTORE_DATABASE_URL" "SELECT count(*) FROM audit_logs")" != "0" ]]; then
    echo "[drill] ✗ audit_logs accepted an UPDATE: the append-only trigger was not restored" >&2
    failures=$((failures + 1))
  fi
else
  echo "[drill] ✓ audit log is still append-only"
fi
if psql "$RESTORE_DATABASE_URL" -q -c "UPDATE inventory SET on_hand = -1 WHERE variant_id IN (SELECT variant_id FROM inventory LIMIT 1)" 2>/dev/null; then
  echo "[drill] ✗ negative stock was accepted: CHECK constraints were not restored" >&2
  failures=$((failures + 1))
else
  echo "[drill] ✓ stock constraints are enforced"
fi
source_seq="$(count "$SOURCE_DATABASE_URL" "SELECT last_value FROM order_number_seq")"
restored_seq="$(count "$RESTORE_DATABASE_URL" "SELECT last_value FROM order_number_seq")"
if [[ "$source_seq" != "$restored_seq" ]]; then
  echo "[drill] ✗ order number sequence at $restored_seq, expected $source_seq (duplicate numbers ahead)" >&2
  failures=$((failures + 1))
else
  echo "[drill] ✓ order number sequence continues from $restored_seq"
fi

rm -f "$dump_file"
if [[ $failures -gt 0 ]]; then
  echo "[drill] FAILED: $failures problem(s)" >&2
  exit 1
fi
echo "[drill] restore verified"
