#!/usr/bin/env node
// Archives Supabase platform logs (API / Auth / Postgres / Storage / Realtime /
// Edge Functions) into per-day NDJSON.gz files via the Supabase Management API.
//
// Why: the free plan retains dashboard logs for 1 day and Log Drains are a
// Pro-only add-on, but the Management API
// (GET /v1/projects/{ref}/analytics/endpoints/logs.all) will serve any window
// up to 24h. So we run this on a schedule (see
// .github/workflows/archive-supabase-logs.yml), pull the last 24h each time,
// and merge/dedupe into day files. Logs then live as long as we keep the files
// (LOGS_RETENTION_DAYS, default 14) instead of vanishing after 1 day.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/fetch-supabase-logs.mjs
//
// Env:
//   SUPABASE_ACCESS_TOKEN  required. Create at https://supabase.com/dashboard/account/tokens
//                          (fine-grained with analytics read is enough; classic PAT works)
//   SUPABASE_PROJECT_REF   required. The subdomain of <ref>.supabase.co
//   SUPABASE_API_URL       default https://api.supabase.com (overridden by the smoke test)
//   LOGS_ARCHIVE_DIR       default supabase/logs-archive
//   LOGS_LOOKBACK_HOURS    default 24 (API hard cap: 24h per query)
//   LOGS_RETENTION_DAYS    default 14 (day files older than this are deleted)
//   LOGS_PAGE_LIMIT        default 1000 (rows per query page; API max)
//   LOGS_REQUEST_DELAY_MS  default 2100 (stays under the API's 30 req/min cap)
//   LOGS_SOURCES           default all. Comma-separated subset, e.g.
//                          'function_logs,postgres_logs'
//
// Output: <LOGS_ARCHIVE_DIR>/<YYYY-MM-DD>.ndjson.gz (UTC), one verbatim API row
// per line with timestamp / source / event_message / log_attributes fields.
// Read them with e.g.:
//   gunzip -c supabase/logs-archive/2026-08-15.ndjson.gz | \
//     jq -c 'select(.source=="function_logs" and (.event_message|test("error";"i")))'

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const SOURCES_ALL = [
  'auth_logs',
  'edge_logs',
  'function_edge_logs',
  'function_logs',
  'postgres_logs',
  'realtime_logs',
  'storage_logs',
]

function fail(msg) {
  console.error(`fetch-supabase-logs: ${msg}`)
  process.exit(1)
}

const env = process.env
const token = env.SUPABASE_ACCESS_TOKEN
const projectRef = env.SUPABASE_PROJECT_REF
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (create one at https://supabase.com/dashboard/account/tokens)')
if (!projectRef) fail('SUPABASE_PROJECT_REF is not set (the subdomain of <ref>.supabase.co)')

const apiBase = (env.SUPABASE_API_URL || 'https://api.supabase.com').replace(/\/+$/, '')
const archiveDir = env.LOGS_ARCHIVE_DIR || 'supabase/logs-archive'
const lookbackMs = Math.min(Math.max(Number(env.LOGS_LOOKBACK_HOURS) || 24, 0.1), 24) * 3600_000
const retentionDays = Number(env.LOGS_RETENTION_DAYS) || 14
const pageLimit = Number(env.LOGS_PAGE_LIMIT) || 1000
const requestDelayMs = Number(env.LOGS_REQUEST_DELAY_MS) || 2100
const sources = env.LOGS_SOURCES
  ? env.LOGS_SOURCES.split(',').map((s) => s.trim()).filter(Boolean)
  : SOURCES_ALL

const endpoint = `${apiBase}/v1/projects/${projectRef}/analytics/endpoints/logs.all`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function quoteSqlLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

// ClickHouse timestamps may come back as "2026-08-15T04:00:00.000Z" or
// "2026-08-15 04:00:00.000"; normalize either to epoch ms (null if unparseable).
function toMs(ts) {
  if (typeof ts === 'number') return ts
  let t = Date.parse(ts)
  if (Number.isNaN(t) && typeof ts === 'string') {
    const fixed = ts.includes(' ', 'T') ? ts : ts.replace(' ', 'T')
    t = Date.parse(fixed.endsWith('Z') ? fixed : `${fixed}Z`)
  }
  return Number.isNaN(t) ? null : t
}

function rowHash(row) {
  const stable = Object.keys(row)
    .sort()
    .map((k) => `${k}=${JSON.stringify(row[k])}`)
    .join('|')
  return createHash('sha1').update(stable).digest('hex')
}

async function fetchPage(startMs, endMs) {
  // The window filter lives in the SQL itself so paging stays correct
  // regardless of how the endpoint treats the iso_* params alongside custom SQL.
  const sql =
    'select * from logs' +
    ` where source in (${sources.map(quoteSqlLiteral).join(', ')})` +
    ` and timestamp >= '${new Date(startMs).toISOString()}'` +
    ` and timestamp < '${new Date(endMs).toISOString()}'` +
    ` order by timestamp asc limit ${pageLimit}`
  const url = new URL(endpoint)
  url.searchParams.set('sql', sql)
  url.searchParams.set('iso_timestamp_start', new Date(startMs).toISOString())
  url.searchParams.set('iso_timestamp_end', new Date(endMs).toISOString())

  for (let attempt = 1; ; attempt++) {
    await sleep(requestDelayMs) // this endpoint allows 30 req/min
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const body = await res.text()
    if (res.status === 429 && attempt === 1) {
      console.warn('rate-limited (429); retrying in 65s')
      await sleep(65_000)
      continue
    }
    if (!res.ok) {
      fail(
        `Management API ${res.status} for window ${new Date(startMs).toISOString()}..` +
          `${new Date(endMs).toISOString()}: ${body.slice(0, 2000)}`
      )
    }
    let json
    try {
      json = JSON.parse(body)
    } catch {
      fail(`Management API returned non-JSON: ${body.slice(0, 500)}`)
    }
    if (!Array.isArray(json.result)) fail(`Management API returned no result array: ${body.slice(0, 500)}`)
    return json.result
  }
}

// Fetch [startMs, endMs). If a window returns a full page, split it in half and
// recurse — bounded paging without cursor/tie problems.
async function collect(startMs, endMs, depth = 0) {
  const rows = await fetchPage(startMs, endMs)
  if (rows.length < pageLimit || depth >= 6 || endMs - startMs <= 60_000) {
    if (rows.length >= pageLimit) {
      console.warn(
        `window ${new Date(startMs).toISOString()}..${new Date(endMs).toISOString()} still hit the ` +
          `${pageLimit}-row page limit; that minute's logs may be incomplete`
      )
    }
    return rows
  }
  const mid = startMs + Math.floor((endMs - startMs) / 2)
  return [...(await collect(startMs, mid, depth + 1)), ...(await collect(mid, endMs, depth + 1))]
}

const endMs = Math.floor(Date.now() / 60_000) * 60_000
const startMs = endMs - lookbackMs
console.log(
  `Fetching logs (${sources.join(', ')}) from ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`
)

const fetched = await collect(startMs, endMs)
mkdirSync(archiveDir, { recursive: true })

// day 'YYYY-MM-DD' -> Map(rowHash -> row), pre-seeded from existing day files
const buckets = new Map()
function bucketFor(day) {
  if (!buckets.has(day)) buckets.set(day, new Map())
  return buckets.get(day)
}

const pruneCutoff = endMs - retentionDays * 86_400_000
for (const f of readdirSync(archiveDir)) {
  const m = /^(\d{4}-\d{2}-\d{2})\.ndjson\.gz$/.exec(f)
  if (!m) continue
  const file = path.join(archiveDir, f)
  if (new Date(`${m[1]}T00:00:00Z`).getTime() < pruneCutoff) {
    unlinkSync(file)
    console.log(`Pruned ${f} (older than ${retentionDays} days)`)
    continue
  }
  const bucket = bucketFor(m[1])
  for (const line of gunzipSync(readFileSync(file)).toString('utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      bucket.set(rowHash(row), row)
    } catch {
      console.warn(`skipping corrupt line in ${f}`)
    }
  }
}

const beforeCount = [...buckets.values()].reduce((n, b) => n + b.size, 0)
for (const row of fetched) {
  const ms = toMs(row.timestamp)
  const day = ms === null ? 'unknown' : new Date(ms).toISOString().slice(0, 10)
  const bucket = bucketFor(day)
  bucket.set(rowHash(row), row) // Map.set dedupes overlapping windows
}

const perSource = {}
for (const [day, bucket] of buckets) {
  const lines = [...bucket.values()]
    .sort((a, b) => (toMs(a.timestamp) ?? 0) - (toMs(b.timestamp) ?? 0))
    .map((row) => {
      perSource[row.source || 'unknown'] = (perSource[row.source || 'unknown'] || 0) + 1
      return JSON.stringify(row)
    })
  writeFileSync(path.join(archiveDir, `${day}.ndjson.gz`), gzipSync(`${lines.join('\n')}\n`))
}

const afterCount = [...buckets.values()].reduce((n, b) => n + b.size, 0)
console.log(
  `Fetched ${fetched.length} rows; merged ${afterCount - beforeCount} new; ` +
    `archive now holds ${afterCount} rows across ${buckets.size} day file(s) in ${archiveDir}. ` +
    `By source: ${Object.entries(perSource).map(([s, n]) => `${s}=${n}`).join(', ') || 'none'}`
)
