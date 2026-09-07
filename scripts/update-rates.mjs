// Fetches the price of a Steam Community Market item in several currencies,
// derives an exchange rate against USD for each, and writes the result to
// data/rates.json (latest) and data/history.json (rolling history).
//
// Ported from the archived "sert" project (https://github.com/somespecialone/sert),
// adapted to run as a plain Node script from GitHub Actions instead of a
// Cloudflare Worker, and to write to JSON files in the repo instead of
// Cloudflare KV. See README.md for the notable differences.

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

async function fetchListingPage(marketHashName, gameId, currencyId) {
  const listingURL = `https://steamcommunity.com/market/listings/${gameId}/${encodeURIComponent(marketHashName)}`
  const query = new URLSearchParams({
    start: '0',
    count: '10',
    country: 'US',
    language: 'english',
    currency: currencyId.toString(),
    filter: ''
  })

  const resp = await fetch(`${listingURL}/render/?${query}`, {
    method: 'GET',
    headers: { referer: listingURL, 'user-agent': 'Mozilla/5.0 (sert-remake rate tracker)' }
  })

  return resp
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true })

  const history = await readJson(HISTORY_FILE)
  const { itemMarketName, steamGameId, currencies: wantedNames, rateLimit, historySize, minUpdateIntervalMinutes } =
    CONFIG

  const wanted = wantedNames.filter((name) => name in CURRENCIES)

  // Skip currencies that were refreshed very recently (e.g. manual re-run).
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
  let referenceListingId = null
  let originalToUSDRate = 1

  // Always fetch USD first, both as the baseline and to pick a reference
  // listing whose id we reuse for every other currency request in this run,
  // so we're comparing the price of the *same* listing across currencies.
  const runOrder = [['USD', 1], ...toFetch.map((name) => [name, CURRENCIES[name]])]

  for (const [currencyName, currencyId] of runOrder) {
    if (requestCount >= rateLimit) {
      console.warn(`Reached per-run rate limit (${rateLimit}); stopping early.`)
      break
    }

    const resp = await fetchListingPage(itemMarketName, steamGameId, currencyId)
    requestCount++

    if (resp.status === 429) {
      console.warn('Hit Steam rate limit (429); stopping this run.')
      break
    }

    if (!resp.ok) {
      console.error(`Request for ${currencyName} failed: ${resp.status} ${resp.statusText}`)
      continue
    }

    const body = await resp.json()
    const listingInfo = body?.listinginfo
    if (!listingInfo || !Object.keys(listingInfo).length) {
      console.error(`No active listings returned for ${currencyName}.`)
      continue
    }

    // Establish the reference listing id from the first (USD) response, then
    // reuse it. Fall back to whatever listing is available if it disappears
    // (e.g. bought) between requests.
    let listingData = referenceListingId ? listingInfo[referenceListingId] : undefined
    if (!listingData) {
      const [fallbackId, fallbackData] = Object.entries(listingInfo)[0]
      if (!referenceListingId) referenceListingId = fallbackId
      listingData = fallbackData
    }

    const updated = Math.round(Date.now() / 1000)

    if (currencyId === 1) {
      originalToUSDRate = round(listingData.price / listingData.converted_price)
      continue
    }

    const rate = round((listingData.converted_price / listingData.price) * originalToUSDRate)
    const previous = history[currencyName]?.[0]?.[0]

    // Sanity check: Steam occasionally returns corrupt converted prices.
    // A currency is very unlikely to move >10x in one update cycle.
    if (previous && (previous / rate > 10 || rate / previous > 10)) {
      console.warn(`Ignoring implausible rate for ${currencyName}: ${previous} -> ${rate}`)
      continue
    }

    const currentHistory = history[currencyName] || []
    currentHistory.unshift([rate, updated])
    history[currencyName] = currentHistory.slice(0, historySize)

    console.log(`${currencyName}: ${rate} (1 USD)`)

    // Be polite to Steam between requests.
    await sleep(1500)
  }

  // Sort currencies by their Steam currency id for stable output.
  const sortedHistory = Object.fromEntries(
    Object.entries(history).sort(([a], [b]) => (CURRENCIES[a] || 0) - (CURRENCIES[b] || 0))
  )

  const rates = Object.fromEntries(
    Object.entries(sortedHistory).map(([name, entries]) => [name, entries[0]])
  )

  await writeFile(HISTORY_FILE, JSON.stringify(sortedHistory, null, 2) + '\n')
  await writeFile(RATES_FILE, JSON.stringify(rates, null, 2) + '\n')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
