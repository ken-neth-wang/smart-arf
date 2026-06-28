# Web deploy — GitHub Pages

The web build auto-deploys to GitHub Pages when you push a tag (or manually).

**Live URL:** https://ken-neth-wang.github.io/smart-arf/

## How it works

```
push tag v0.3          # or: click "Run workflow" in Actions tab
   │
   ▼
.github/workflows/deploy-web.yml
   │  npm ci → npx expo export -p web  → dist/
   ▼
push dist/ → gh-pages branch
   │
   ▼
GitHub Pages serves it  →  https://ken-neth-wang.github.io/smart-arf/
```

## One-time setup (GitHub repo settings)

1. Go to **Settings → Pages**
2. **Source:** "Deploy from a branch"
3. **Branch:** `gh-pages` / `(root)` — Save

(The `gh-pages` branch is created automatically on the first deploy.)

## How to publish a new version

```bash
git tag v0.3
git push origin v0.3
```

Or tag-and-push in one step:
```bash
git tag v0.3 && git push origin v0.3
```

Watch the deploy at **Actions tab → "Deploy Web" workflow**. Goes live in ~1–2 min after it completes.

## Why `baseUrl` matters

Because the site lives at a subpath (`/smart-arf/`) and not the domain root, `app.json` sets:

```json
"web": { "baseUrl": "/smart-arf/" }
```

If you later move to a custom domain (e.g. `smartarf.app`), set `"baseUrl": "/"` instead.

## What this does NOT do

- **iOS / Android builds** — those use `eas build` / `eas submit` (separate, runs on Expo's cloud, not GitHub Pages).
- **Database / backend** — Pages only hosts static files. Backend (Supabase, when you get there) is added separately.
