#!/usr/bin/env bash
# Smart-ARF — Supabase DB backup/restore to Cloudflare R2 (S3-compatible).
#
# Subcommands:
#   backup                pg_dump (public schema) → openssl-encrypt → upload to R2
#                         → prune objects older than $RETENTION_DAYS
#   restore <name|latest> <target-db-url>
#                         download from R2 → verify sha256 → decrypt → sectioned
#                         pg_restore (stubs auth.users rows referenced by profiles)
#   fetch <name|latest>   download a backup from R2 → verify sha256 → decrypt
#                         → plain dump in BACKUP_DIR. No DB connection needed
#                         (R2 creds + passphrase only). Plaintext PHI on disk.
#
# Required env:
#   backup:               SUPABASE_DB_URL BACKUP_PASSPHRASE
#                         R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT R2_BUCKET
#   restore:              BACKUP_PASSPHRASE R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
#                         R2_ENDPOINT R2_BUCKET  (+ target URL as arg 2 or TARGET_DB_URL)
#   fetch:                same as restore (minus the target URL)
#
# Optional env:
#   PG_MAJOR=17           server major version; pg_dump/pg_restore clients must be
#                         >= this. Falls back to `docker run postgres:<major>-alpine`
#                         when the local client is too old (e.g. macOS homebrew 14).
#   RETENTION_DAYS=30     R2 objects older than this are deleted after each backup.
#   BACKUP_DIR=backups    local scratch dir (gitignored). Plain dumps are deleted
#                         right after encryption; only .enc + .sha256 are uploaded.
#   KEEP_LOCAL=0          set 1 to keep the encrypted copy on disk after upload.
#
# DB URL: use the SESSION pooler URI (port 5432) from Dashboard → Connect.
# Transaction-mode (6543) breaks pg_dump. URL-encode special chars in the password.
#
# What is NOT backed up (by design — see docs/backup-restore.md):
#   auth.users, storage.objects metadata, and the photos bucket files.

set -euo pipefail

PG_MAJOR="${PG_MAJOR:-17}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

die() { echo "supabase-db.sh: ERROR: $*" >&2; exit 1; }
usage() {
  sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

need_env() {
  local v
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || die "missing env var: $v"
  done
}

client_major() { # $1 = pg_dump|pg_restore → prints client major, or nothing
  command -v "$1" >/dev/null 2>&1 || return 1
  "$1" --version | sed -E 's/.* ([0-9]+)\..*/\1/'
}

run_pg_dump() { # $1 = output file (.dump) ; uses $SUPABASE_DB_URL
  local out="$1" v
  out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
  v="$(client_major pg_dump || true)"
  if [[ -n "$v" && "$v" -ge "$PG_MAJOR" ]]; then
    pg_dump "$SUPABASE_DB_URL" -n public -Fc -f "$out"
    return
  fi
  command -v docker >/dev/null 2>&1 \
    || die "need pg_dump >= $PG_MAJOR in PATH, or docker (found client: ${v:-none})"
  echo "local pg_dump is ${v:-missing} < $PG_MAJOR; using docker postgres:$PG_MAJOR-alpine" >&2
  docker run --rm -e DB_URL="$SUPABASE_DB_URL" \
    -v "$(dirname "$out"):/out" "postgres:$PG_MAJOR-alpine" \
    sh -c 'pg_dump "$DB_URL" -n public -Fc -f /out/dump.tmp' \
    && mv "$(dirname "$out")/dump.tmp" "$out"
}

run_pg_restore() { # $1 = dump file ; uses $TARGET_DB_URL  (destructive: replaces public schema)
  local dmp="$1" v dir
  dmp="$(cd "$(dirname "$dmp")" && pwd)/$(basename "$dmp")"
  dir="$(dirname "$dmp")"

  # A public-only dump can't be restored with a plain `pg_restore`:
  #  • public FKs reference auth.users (profiles.id, memberships.user_id,
  #    *.created_by/updated_by, …), which is NOT in the dump — FK validation
  #    dies against a fresh project's empty auth.users.
  #  • per-object --clean drops fail when the target's own RLS policies or
  #    FKs reference the objects being dropped (re-restores, live projects).
  # So: wipe `public` wholesale, restore in sections, and seed stub
  # auth.users rows (same ids, NULL password) from the restored profiles
  # between DATA and POST_DATA — that's where FK constraints get added.
  # Afterwards reset each stub's password from the Supabase dashboard
  # (Authentication → Users). See docs/backup-restore.md.
  cat >"$dir/restore.pre.sql" <<'SQL'
drop schema if exists public cascade;
SQL
  cat >"$dir/restore.auth-stubs.sql" <<'SQL'
insert into auth.users (id, aud, role, email, created_at, updated_at)
select p.id, 'authenticated', 'authenticated',
       coalesce(nullif(p.email, ''), 'restored+' || p.id || '@smart-arf.invalid'),
       now(), now()
  from public.profiles p
on conflict do nothing;
SQL

  v="$(client_major pg_restore || true)"
  if [[ -n "$v" && "$v" -ge "$PG_MAJOR" ]]; then
    psql  -X -v ON_ERROR_STOP=1 -d "$TARGET_DB_URL" -f "$dir/restore.pre.sql"
    pg_restore -1 --section=pre-data  -d "$TARGET_DB_URL" "$dmp"
    pg_restore -1 --section=data      -d "$TARGET_DB_URL" "$dmp"
    psql  -X -v ON_ERROR_STOP=1 -d "$TARGET_DB_URL" -f "$dir/restore.auth-stubs.sql"
    pg_restore -1 --section=post-data -d "$TARGET_DB_URL" "$dmp"
    return
  fi
  command -v docker >/dev/null 2>&1 \
    || die "need pg_restore/psql >= $PG_MAJOR in PATH, or docker (found client: ${v:-none})"
  echo "local pg_restore is ${v:-missing} < $PG_MAJOR; using docker postgres:$PG_MAJOR-alpine" >&2
  docker run --rm -e DB_URL="$TARGET_DB_URL" \
    -v "$dir:/dump:ro" "postgres:$PG_MAJOR-alpine" \
    sh -c 'set -e
           psql -X -v ON_ERROR_STOP=1 -d "$DB_URL" -f /dump/restore.pre.sql
           pg_restore -1 --section=pre-data  -d "$DB_URL" /dump/dump.tmp
           pg_restore -1 --section=data      -d "$DB_URL" /dump/dump.tmp
           psql -X -v ON_ERROR_STOP=1 -d "$DB_URL" -f /dump/restore.auth-stubs.sql
           pg_restore -1 --section=post-data -d "$DB_URL" /dump/dump.tmp' \
    </dev/null
}

# ── R2 plumbing ────────────────────────────────────────────────
R2_CFG=""
cleanup() { [[ -n "$R2_CFG" ]] && rm -f "$R2_CFG"; }
trap cleanup EXIT

r2_setup() {
  need_env R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT R2_BUCKET
  command -v rclone >/dev/null 2>&1 || die "rclone not found (brew install rclone)"
  R2_CFG="$(mktemp)"
  cat >"$R2_CFG" <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = ${R2_ENDPOINT}
region = auto
acl = private
no_check_bucket = true
EOF
}

r2() { rclone --config "$R2_CFG" "$@"; }
sha256_of() { openssl dgst -sha256 -r "$1" | cut -d' ' -f1; }

# ── Subcommands ────────────────────────────────────────────────
do_backup() {
  need_env SUPABASE_DB_URL BACKUP_PASSPHRASE
  r2_setup
  mkdir -p "$BACKUP_DIR"

  local ts out enc sum
  ts="$(date -u +%Y-%m-%dT%H%M%SZ)"
  out="$BACKUP_DIR/db-$ts.dump"
  enc="$out.enc"
  sum="$enc.sha256"

  echo "→ dumping public schema ($ts)"
  run_pg_dump "$out"

  echo "→ encrypting (aes-256-cbc + pbkdf2)"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$out" -out "$enc" -pass env:BACKUP_PASSPHRASE
  rm -f "$out" # PHI hygiene: no plaintext dump lingers

  printf '%s  %s\n' "$(sha256_of "$enc")" "$(basename "$enc")" >"$sum"

  echo "→ uploading to r2:$R2_BUCKET/db/"
  r2 copyto "$enc" "r2:$R2_BUCKET/db/$(basename "$enc")"
  r2 copyto "$sum" "r2:$R2_BUCKET/db/$(basename "$sum")"

  echo "→ pruning objects older than ${RETENTION_DAYS}d"
  r2 delete "r2:$R2_BUCKET/db" --min-age "${RETENTION_DAYS}d"

  [[ "${KEEP_LOCAL:-0}" = 1 ]] || rm -f "$enc" "$sum"
  echo "✓ backup complete: db/$(basename "$enc")"
  r2 ls "r2:$R2_BUCKET/db" | tail -n 4
}

do_restore() {
  local name="${1:-}" target="${2:-${TARGET_DB_URL:-}}"
  [[ -n "$name" ]] || usage 1
  [[ -n "$target" ]] || die "no target DB URL (pass as arg 2 or set TARGET_DB_URL)"
  need_env BACKUP_PASSPHRASE
  r2_setup

  if [[ "$name" = latest ]]; then
    name="$(r2 lsf --files-only "r2:$R2_BUCKET/db" | (LC_ALL=C sort) | grep '\.enc$' | tail -n 1)"
    [[ -n "$name" ]] || die "no backups found in r2:$R2_BUCKET/db"
  fi

  local tmp enc sum want got
  tmp="$(mktemp -d)"
  enc="$tmp/$(basename "$name")"
  sum="$enc.sha256"

  echo "→ downloading $name"
  r2 copyto "r2:$R2_BUCKET/db/$name" "$enc"
  r2 copyto "r2:$R2_BUCKET/db/$name.sha256" "$sum" || die "missing .sha256 sidecar for $name"

  want="$(awk '{print $1}' "$sum")"
  got="$(sha256_of "$enc")"
  [[ "$want" = "$got" ]] || die "sha256 mismatch (want $want, got $got) — download corrupted?"

  echo "→ decrypting"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$enc" -out "$tmp/dump.tmp" -pass env:BACKUP_PASSPHRASE

  echo "→ restoring public schema into target (DESTRUCTIVE: drops/replaces public tables)"
  TARGET_DB_URL="$target" run_pg_restore "$tmp/dump.tmp"
  rm -rf "$tmp"
}
do_fetch() { # $1 = name|latest → decrypted dump lands in $BACKUP_DIR
  local name="${1:-latest}" enc sum out
  need_env BACKUP_PASSPHRASE
  r2_setup
  [[ "$name" != *.enc ]] && name="$name.enc"

  if [[ "$name" = latest.enc ]]; then
    name="$(r2 lsf --files-only "r2:$R2_BUCKET/db" | (LC_ALL=C sort) | grep '\.enc$' | tail -n 1)"
    [[ -n "$name" ]] || die "no backups found in r2:$R2_BUCKET/db"
  fi

  mkdir -p "$BACKUP_DIR"
  enc="$BACKUP_DIR/$(basename "$name")"
  sum="$enc.sha256"

  echo "→ downloading $name"
  r2 copyto "r2:$R2_BUCKET/db/$name" "$enc"
  r2 copyto "r2:$R2_BUCKET/db/$name.sha256" "$sum" || die "missing .sha256 sidecar for $name"
  [[ "$(awk '{print $1}' "$sum")" = "$(sha256_of "$enc")" ]] \
    || die "sha256 mismatch for $name — download corrupted?"

  out="${enc%.enc}"
  echo "→ decrypting to $out"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$enc" -out "$out" -pass env:BACKUP_PASSPHRASE
  rm -f "$enc" "$sum"
  echo "✓ $out  (plaintext patient data — delete when done)"
}

do_list() {
  r2_setup
  r2 ls "r2:$R2_BUCKET/db"
}
# ── Dispatch ───────────────────────────────────────────────────
case "${1:-}" in
  backup)  shift; do_backup "$@" ;;
  restore) shift; do_restore "$@" ;;
  fetch)   shift; do_fetch "$@" ;;
  list)    shift; do_list "$@" ;;
  -h|--help|help) usage 0 ;;
  *) usage 1 ;;
esac
