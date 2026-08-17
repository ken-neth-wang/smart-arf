# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Git discipline

**NEVER run `git push` (or `git fetch`, `git pull`, `eas submit`, or any command that
sends local state to a remote).** The owner pushes manually. This is a hard rule — do not
push even if a task seems to require it, and do not "just finish it off" with a push.

Local commits and branches are fine. Staging is fine. Just never leave the local machine.

If something genuinely needs to go to the remote, STOP and ask the owner to do the push.

## Supabase is owner-only

The hosted Supabase project (Smart-ARF) is **read-only for agents**. NEVER run
`supabase login`, `supabase link`, `supabase db push`, `supabase functions deploy`,
or any command that mutates it. NEVER connect to its Postgres database (psql or
otherwise). NEVER read or edit `.env`. If a task seems to need a schema change,
migration, or edge-function deploy, write the SQL/code and STOP — the owner runs it.

The anon key in `.env` is RLS-gated (server-enforced); it is not a write path.
That enforcement is the only real barrier — do not attempt to work around it.
