# sert-remake

A Steam Community Market exchange rate tracker, remade from the archived
[`somespecialone/sert`](https://github.com/somespecialone/sert) project so it
can run entirely on GitHub, for free, with no external accounts.

It periodically checks the price of one Steam Market item in several
currencies, uses that to derive each currency's exchange rate against USD,
and shows the result on a small static site with a converter and history
sparklines.

## How it works

- **`scripts/update-rates.mjs`** — fetches the tracked item's listing page
  from `steamcommunity.com` in USD and in each configured currency, computes
  an exchange rate from the price difference, and writes `data/rates.json`
  (latest rate per currency) and `data/history.json` (rolling history).
- **`.github/workflows/update-rates.yml`** — runs that script on a schedule
  (twice an hour) and commits the updated JSON files back to the repo.
- **`.github/workflows/pages.yml`** — deploys `site/` (plus a copy of
  `data/`) to GitHub Pages whenever the data or site changes.
- **`site/`** — a dependency-free HTML/CSS/JS page that reads
  `data/rates.json` and `data/history.json` directly and renders a rate
  ticker, a currency converter, and per-currency sparklines.

There's no server, database, or build step — GitHub Actions is the "cron
job", the git repo is the "database", and GitHub Pages is the host.

## Setup

1. Push this to a new GitHub repository.
2. In **Settings → Pages**, set **Source** to "GitHub Actions".
3. In **Settings → Actions → General → Workflow permissions**, select
   **"Read and write permissions"** so the update workflow can commit data.
4. Run the **"Update Steam exchange rates"** workflow once manually (Actions
   tab → select it → *Run workflow*) to populate `data/*.json` instead of
   waiting for the first scheduled run.
5. The **"Deploy to GitHub Pages"** workflow runs automatically after that
   commit lands and publishes the site.

## Configuration

Edit `scripts/config.mjs`:

- `itemMarketName` / `steamGameId` — which Steam Market item to track.
  Defaults to the CS2 "Fracture Case" because cases are cheap and always
  have active listings, which keeps the tracker reliable.
- `currencies` — which currencies to track (see `CURRENCIES` in the same
  file for supported codes).
- `rateLimit` — max Steam requests per run. Steam rate-limits aggressively;
  keep this low (3–5) and rely on the schedule to eventually cover more
  currencies if you add them.
- `historySize` — how many history points to keep per currency.

## Notable differences from the original `sert`

The original was a Nitro app deployed as a Cloudflare Worker (cron trigger +
Cloudflare KV storage) with a separate SvelteKit frontend. This remake trades
some of that for something that runs entirely on GitHub Pages/Actions:

- **Storage**: Cloudflare KV → JSON files in the repo, updated via committed
  changes ("git scraping"). Simple, free, and versioned for free as a side
  effect, at the cost of a commit per update cycle.
- **Scheduling**: Cloudflare Cron Trigger → GitHub Actions `schedule`. GitHub
  does not guarantee scheduled workflows run at the exact minute, especially
  during platform load — treat the cadence as approximate.
- **Reference listing**: the original pinned a specific Steam listing ID in
  config, which goes stale once that listing sells. This remake picks the
  first available listing at the start of each run and reuses it for that
  run's other currency requests, so it never needs manual updating.
- **Frontend**: SvelteKit → a single static HTML/CSS/JS page with no build
  step, since GitHub Pages serves static files directly.
- **Refresh cadence**: the original's cron fired twice an hour, but its
  "already fresh" check only compared calendar dates, so each currency
  actually only refreshed once per UTC day in practice. This remake checks
  actual elapsed minutes (`minUpdateIntervalMinutes`), so it refreshes on
  (roughly) every scheduled run — a genuinely live tracker rather than a
  once-daily one, at the cost of a few more Steam requests per day.
- **Rounding**: rates are kept to 4 decimal places instead of 2, since most
  tracked currencies (EUR, GBP, etc.) sit close to 1.0 relative to USD, where
  2 decimals throws away a meaningful amount of precision.

## Local development

```bash
node scripts/update-rates.mjs   # fetch rates once (needs internet access to steamcommunity.com)
npx serve site                  # or any static file server, to preview the UI
```

To preview the UI with the real repo data, copy `data/*.json` into `site/data/`
before serving, mirroring what the Pages workflow does at deploy time.
