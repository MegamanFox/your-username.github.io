# sert-remake

A currency exchange rate tracker, loosely remade from the archived
[`somespecialone/sert`](https://github.com/somespecialone/sert) project. It
shows real USD exchange rates for a handful of currencies, with a converter
and history sparklines, refreshed automatically once a day — running
entirely on GitHub, for free, with no external accounts needed.

## How it works

- **`scripts/update-rates.mjs`** — fetches real USD exchange rates from
  [Frankfurter](https://frankfurter.dev) (a free, open-source API backed by
  the European Central Bank and partner central banks) and writes
  `data/rates.json` (latest rate per currency) and `data/history.json`
  (rolling history).
- **`.github/workflows/update-rates.yml`** — runs that script once a day and
  commits the updated JSON files back to the repo.
- **`.github/workflows/pages.yml`** — deploys `site/` (plus a copy of
  `data/`) to GitHub Pages whenever the data or site changes.
- **`site/`** — a dependency-free HTML/CSS/JS page that reads
  `data/rates.json` and `data/history.json` directly and renders a rate
  ticker, a currency converter, and per-currency sparklines.

There's no server, database, or build step — GitHub Actions is the "cron
job", the git repo is the "database", and GitHub Pages is the host.

## Setup

1. Push this to a new **public** GitHub repository (GitHub Pages on the free
   plan requires the repo to be public).
2. In **Settings → Pages**, set **Source** to "GitHub Actions".
3. In **Settings → Actions → General → Workflow permissions**, select
   **"Read and write permissions"** so the update workflow can commit data.
4. Run the **"Update exchange rates"** workflow once manually (Actions tab →
   select it → *Run workflow*) to populate `data/*.json` instead of waiting
   for the first scheduled run.
5. The **"Deploy to GitHub Pages"** workflow runs automatically after that
   commit lands and publishes the site.

## Configuration

Edit `scripts/config.mjs`:

- `currencies` — which currencies to track against USD. Any code Frankfurter
  supports works — see the full list at
  `https://api.frankfurter.dev/v2/currencies`.
- `historySize` — how many history points to keep per currency.
- `minUpdateIntervalHours` — skip re-fetching a currency that was already
  updated more recently than this. Defaults to 20h, since the underlying
  data only changes about once a day anyway.

## Why this data source

The original `sert` derived exchange rates indirectly, from how Valve prices
one Steam Market item across regions. That's a neat trick, but it inherits
every quirk of Steam's own formatting and pricing behavior — including
currencies Steam displays as whole numbers with no decimal places, which
this project hit directly (a Russian ruble price came out 100x too large
because of that formatting difference). Frankfurter sidesteps all of that:
it's real central bank data, meant to be machine-read, with none of the
anti-bot friction Steam's endpoints have when called from shared CI IP
ranges.

## Local development

```bash
node scripts/update-rates.mjs   # fetch rates once
npx serve site                  # or any static file server, to preview the UI
```

To preview the UI with real repo data, copy `data/*.json` into `site/data/`
before serving, mirroring what the Pages workflow does at deploy time.
