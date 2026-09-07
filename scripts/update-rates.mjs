// Fetches the price of a Steam Community Market item in several currencies,
// derives an exchange rate against USD for each, and writes the result to
// data/rates.json (latest) and data/history.json (rolling history).
//
// Uses Steam's public `priceoverview` endpoint — the same lightweight,
// widely-used endpoint that most third-party Steam price trackers and
// browser extensions hit — rather than scraping the full listing/render
// page. It's simpler (one item price per request, no listing-id bookkeeping)
// and, in practice, far less likely to be challenged as bot traffic than the
// heavier render endpoint.
//
// Loosely based on the archived "sert" project
// (https://github.com/somespecialone/sert); see README.md for how this
// differs from the original.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURRENCIES, CONFIG } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const RATES_FILE = path.join(DATA_DIR, 'rates.json')
const HISTORY_FILE = path.join(DATA_DIR, 'history.json')

const round = (n) => Math.round(n * 1e4) / 1e4
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(file) {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch {
    return {}
  }
}

function isFresh(updatedTs, minMinutes) {
  if (!updatedTs) return false
  const ageMinutes = (Date.now() / 1000 - updatedTs) / 60
  return ageMinutes < minMinutes
}

// Steam formats prices as locale strings ("$0.03", "0,03€", "R$ 0,03", ...).
// Strip everything but digits/separators, then treat whichever of ',' or '.'
// appears LAST as the decimal separator (the other, if present, is a
// thousands separator). Reliable for the small values items like this sell for.
function parsePrice(str) {
  if (!str) return null
  const cleaned = str.replace(/[^\d,.\-]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalIdx = Math.max(lastComma, lastDot)
  if (decimalIdx === -1) return parseFloat(cleaned) || null
  const intPart = cleaned.slice(0, decimalIdx).replace(/[,.]/g, '')
  const fracPart = cleaned.slice(decimalIdx + 1)
  const value = parseFloat(`${intPart || '0'}.${fracPart}`)
  return Number.isFinite(value) ? value : null
}

async function fetchPriceOverview(marketHashName, gameId, currencyId, attempt = 1) {
  const query = new URLSearchParams({
    appid: gameId,
    market_hash_name: marketHashName,
    currency: currencyId.toString()
  })
  const url = `https://steamcommunity.com/market/priceoverview/?${query}`

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      referer: `https://steamcommunity.com/market/listings/${gameId}/${encodeURIComponent(marketHashName)}`
    }
  })

  if (resp.status === 429 || resp.status === 503) {
    if (attempt < 4) {
      const backoff = 8000 * attempt
      console.warn(`Got ${resp.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/4)...`)
      await sleep(backoff)
      return fetchPriceOverview(marketHashName, gameId, currencyId, attempt + 1)
    }
    return { ok: false, status: resp.status, reason: 'rate-limited' }
  }

  const contentType = resp.headers.get('content-type') || ''
  const rawText = await resp.text()

  if (!resp.ok || !contentType.includes('json')) {
    return {
      ok: false,
      status: resp.status,
      reason: 'non-json-response',
      snippet: rawText.slice(0, 300)
    }
  }

  try {
    const json = JSON.parse(rawText)
    if (!json.success) {
      return { ok: false, status: resp.status, reason: 'success-false', snippet: rawText.slice(0, 300) }
    }
    return { ok: true, json }
  } catch {
    return { ok: false, status: resp.status, reason: 'invalid-json', snippet: rawText.slice(0, 300) }
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true })

  const history = await readJson(HISTORY_FILE)
  const { itemMarketName, steamGameId, currencies: wantedNames, rateLimit, historySize, minUpdateIntervalMinutes } =
    CONFIG

  const wanted = wantedNames.filter((name) => name in CURRENCIES)
  const toFetch = wanted.filter((name) => {
    const latest = history[name]?.[0]
    return !isFresh(latest?.[1], minUpdateIntervalMinutes)
  })

  if (toFetch.length === 0) {
    console.log('All tracked currencies are already fresh, nothing to do.')
    return
  }

  console.log(`Tracking "${itemMarketName}" (app ${steamGameId}). Updating: ${toFetch.join(', ')}`)

  let requestCount = 0
  let usdPrice = null
  let sawFailure = false
  let wasRateLimited = false

  const runOrder = [['USD', 1], ...toFetch.map((name) => [name, CURRENCIES[name]])]

  for (const [currencyName, currencyId] of runOrder) {
    if (requestCount >= rateLimit) {
      console.warn(`Reached per-run rate limit (${rateLimit}); stopping early.`)
      break
    }

    // Be polite to Steam before every request, including the first.
    await sleep(1500 + Math.random() * 1000)

    const result = await fetchPriceOverview(itemMarketName, steamGameId, currencyId)
    requestCount++

    if (!result.ok) {
      sawFailure = true
      console.error(`Request for ${currencyName} failed (${result.reason}, status ${result.status}).`)
      if (result.snippet) {
        console.error(`Response started with: ${JSON.stringify(result.snippet)}`)
      }
      if (result.reason === 'rate-limited') {
        wasRateLimited = true
        console.warn('Stopping this run after repeated rate limiting.')
        break
      }
      continue
    }

    const price = parsePrice(result.json.lowest_price || result.json.median_price)
    if (price === null) {
      console.error(`Could not parse a price for ${currencyName} from`, result.json)
      continue
    }

    const updated = Math.round(Date.now() / 1000)

    if (currencyId === 1) {
      usdPrice = price
      console.log(`USD reference price: $${price}`)
      continue
    }

    if (usdPrice === null) {
      console.error(`Skipping ${currencyName}: no USD reference price for this run.`)
      continue
    }

    const rate = round(price / usdPrice)
    const previous = history[currencyName]?.[0]?.[0]

    // Sanity check: a currency is very unlikely to move >10x in one cycle.
    if (previous && (previous / rate > 10 || rate / previous > 10)) {
      console.warn(`Ignoring implausible rate for ${currencyName}: ${previous} -> ${rate}`)
      continue
    }

    const currentHistory = history[currencyName] || []
    currentHistory.unshift([rate, updated])
    history[currencyName] = currentHistory.slice(0, historySize)

    console.log(`${currencyName}: ${rate} per 1 USD`)
  }

  const sortedHistory = Object.fromEntries(
    Object.entries(history).sort(([a], [b]) => (CURRENCIES[a] || 0) - (CURRENCIES[b] || 0))
  )
  const rates = Object.fromEntries(Object.entries(sortedHistory).map(([name, entries]) => [name, entries[0]]))

  await writeFile(HISTORY_FILE, JSON.stringify(sortedHistory, null, 2) + '\n')
  await writeFile(RATES_FILE, JSON.stringify(rates, null, 2) + '\n')

  console.log('Done.')

  // Steam rate-limiting is a transient, external condition tied to whichever
  // shared runner IP this job happened to land on — not a bug in this script.
  // The next scheduled run gets a fresh runner (likely a different IP), so
  // don't mark the workflow as failed for this; just note it clearly in logs.
  if (wasRateLimited && Object.keys(rates).length === 0) {
    console.warn('Steam rate-limited this run before any price was fetched. Skipping — the next scheduled run will try again on a fresh runner.')
    return
  }

  // A genuinely unexpected failure (not rate limiting) with nothing updated
  // is worth surfacing as a failed run, since it likely needs attention.
  if (sawFailure && Object.keys(rates).length === 0) {
    console.error('No currencies were successfully updated this run.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
