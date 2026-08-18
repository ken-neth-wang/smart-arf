# Supabase backup & restore runbook

Free-tier Supabase takes **no automatic backups** — daily backups start at the
Pro plan ($25/mo). Our substitute: a scheduled GitHub Actions workflow that
runs daily at 06:23 UTC, `pg_dump`s the `public` schema, encrypts it
(aes-256-cbc + pbkdf2), and uploads it to a private Cloudflare R2 bucket,
keeping the last 30 days.

- Workflow: [`.github/workflows/supabase-backup.yml`](../.github/workflows/supabase-backup.yml)
- Script: [`scripts/supabase-db.sh`](../scripts/supabase-db.sh) (`backup` / `restore` / `list`)
- Cost: $0. R2 free tier = 10 GB storage + free egress; daily dumps are ~1–10 MB,
  so 30 days ≈ 300 MB ≈ 3% of the free quota.

## What is and isn't covered

| In every backup | NOT backed up |
|---|---|
| All `public` schema tables (clinics, profiles, memberships, allowed_emails, patients, encounters, photos metadata) | `auth.users` — login accounts. Recovery = re-run `supabase/seed.sql` + re-sign-up |
| RLS policies, functions, triggers on public tables | `storage.objects` metadata |
| | **photos bucket files** — DB backups never include Storage objects; restoring does not bring deleted photos back |

## One-time setup

### 1. Cloudflare R2

1. Cloudflare dashboard → R2. Activation requires a card on file; the free
   tier charges nothing at our volume.
2. Create bucket: **`smart-arf-backups`**, default location, no public access.
3. R2 → Manage API Tokens → Create API Token → **Object Read & Write**, scope:
   *Apply to specific buckets only* → `smart-arf-backups`. Save:
   - Access Key ID
   - Secret Access Key
   - Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### 2. GitHub repo settings

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `SUPABASE_DB_URL` | **Session pooler** URI (port **5432**) from Supabase Dashboard → Connect. Transaction-mode (6543) breaks `pg_dump`. URL-encode special chars in the password. |
| Secret | `BACKUP_PASSPHRASE` | Long random string — the encryption key. **Also store it in your password manager**: GitHub is the only place it lives, and a lost passphrase makes every backup undecryptable. |
| Secret | `R2_ACCESS_KEY_ID` | from step 1.3 |
| Secret | `R2_SECRET_ACCESS_KEY` | from step 1.3 |
| Secret | `R2_ENDPOINT` | from step 1.3 |
| Variable | `R2_BUCKET` | `smart-arf-backups` |

### 3. Verify

Actions tab → **Supabase DB Backup** → Run workflow. Expect a green run whose
log ends with `✓ backup complete: db/<timestamp>.dump.enc`. Then check the
bucket in the Cloudflare dashboard: two objects (`…dump.enc`, `…dump.enc.sha256`).

> Note: scheduled workflows only run on the default branch, and GitHub pauses
> them after 60 days with no repo activity — if paused, re-run once manually.

## Running manually / locally

```bash
# prerequisites: docker (pg client fallback), rclone (brew install rclone)
export SUPABASE_DB_URL='postgres://...'      # session pooler URI
export BACKUP_PASSPHRASE='...'
export R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
export R2_ENDPOINT='https://<account>.r2.cloudflarestorage.com'
export R2_BUCKET=smart-arf-backups

scripts/supabase-db.sh backup   # dump → encrypt → upload → prune
scripts/supabase-db.sh fetch latest   # download + decrypt latest → backups/db-*.dump
scripts/supabase-db.sh list     # what's in R2 right now
```

## Restoring

**Recommended: restore into a fresh Supabase project** (create project → run
restore → repoint the app's env → delete the old project). Restoring into the
live project wipes and replaces its entire `public` schema and takes the app
offline for the duration.

```bash
# from a machine with the secrets above (minus SUPABASE_DB_URL):
scripts/supabase-db.sh restore latest '<target-session-pooler-url>:5432/postgres'
# or a specific object:
scripts/supabase-db.sh restore db-2026-08-17T062301Z.dump.enc '<target-db-url>'
```

What the script does (public-only dumps can't take a plain `pg_restore` —
our FKs into `auth.users` fail validation against a fresh project's empty
auth tables):

1. download → verify `.sha256` → decrypt
2. `drop schema public cascade` — full, deterministic wipe (extra/unknown
   tables in the target go too)
3. restore in sections: tables/functions → data → **seed stub `auth.users`
   rows** (same UUIDs + emails as the restored `profiles`, NULL passwords) →
   constraints/indexes/triggers/RLS policies

Because the stub accounts keep the original UUIDs, **all restored data stays
linked** — profiles, memberships, encounter authorship, everything.

Afterwards:

1. Give each account a password: Dashboard → Authentication → Users → the
   user → **Send password reset** / **Generate link** (stubs are created
   with NULL passwords).
2. Recreate the two things a public-only dump can't carry (copy the exact
   statements from `supabase/schema.sql`): the `on_auth_user_created` trigger
   on `auth.users` (future signups auto-create profiles again) and, only if
   you restored into an already-initialized project, the storage policies on
   `storage.objects` (the schema wipe cascade-drops them).
3. Spot-check: `select count(*) from patients;`, `select * from profiles;`,
   and confirm RLS shows up in Dashboard → Authentication → Policies.

## Rehearsing a restore (without touching production)

The backup itself is **read-only** — the very first run against production
is safe. To prove the whole pipeline end-to-end before you ever need it:

**Option A — throwaway Supabase project (the real rehearsal, ~10 min):**

1. Create a second free Supabase project (free tier allows two). Don't run
   `schema.sql` in it — a restore expects a blank project.
2. Restore the latest prod backup into it:
   `scripts/supabase-db.sh restore latest '<new-project-session-pooler-url>'`
3. Poke around the SQL editor: table counts vs production, RLS policies,
   the restored `profiles` rows.
4. Delete the project. Cost: $0.

**Option B — fully local, no Supabase at all (what CI runs):**

```bash
# source DB stand-in + restore target
docker run -d --name pg-src -e POSTGRES_PASSWORD=src -p 55432:5432 postgres:17-alpine
docker run -d --name pg-dst -e POSTGRES_PASSWORD=dst -p 55433:5432 postgres:17-alpine
export SUPABASE_DB_URL='postgres://postgres:src@host.docker.internal:55432/postgres'
# …plus BACKUP_PASSPHRASE / R2_* env, then:
scripts/supabase-db.sh backup
scripts/supabase-db.sh restore latest 'postgres://postgres:dst@host.docker.internal:55433/postgres'
```

## Operational notes

- **Retention:** `RETENTION_DAYS=30` (workflow env). R2 pruning runs after
  every backup.
- **Silent failures:** GitHub emails the workflow author on scheduled-run
  failure; still worth glancing at the Actions tab after the first few days.
  `scripts/supabase-db.sh list` shows what actually landed.
- **Privacy:** dumps contain patient data. They are encrypted before leaving
  the runner, land in a private bucket, and the plaintext dump is deleted
  immediately after encryption (`KEEP_LOCAL=1` keeps the encrypted copy only).
  R2 encrypts at rest by default. Know your compliance obligations before
  pointing this at real patient data.
- **Deleting the Supabase project deletes everything** — there is no hosted
  backup to fall back on; these R2 objects are the only copy.
