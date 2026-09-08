// Fetches real USD exchange rates from Frankfurter (https://frankfurter.dev),
// a free, open-source API backed by the European Central Bank and partner
// central banks — no API key, no rate limits worth worrying about for a
// tracker this size. Writes data/rates.json (latest) and data/history.json
// (rolling history).

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const RATES_FILE = path.join(DATA_DIR, 'rates.json')
const HISTORY_FILE = path.join(DATA_DIR, 'history.json')

async function readJson(file) {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch {
    return {}
  }
}

function isFresh(updatedTs, minHours) {
  if (!updatedTs) return false
  const ageHours = (Date.now() / 1000 - updatedTs) / 3600
  return ageHours < minHours
}

async function fetchRate(quoteCurrency) {
  const url = `https://api.frankfurter.dev/v2/rate/USD/${quoteCurrency}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Frankfurter request for ${quoteCurrency} failed: ${resp.status} ${await resp.text()}`)
  }
  const body = await resp.json()
  if (typeof body.rate !== 'number') {
    throw new Error(`Unexpected Frankfurter response for ${quoteCurrency}: ${JSON.stringify(body)}`)
  }
  return body.rate
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true })

  const history = await readJson(HISTORY_FILE)
  const { currencies, historySize, minUpdateIntervalHours } = CONFIG

  const toFetch = currencies.filter((name) => !isFresh(history[name]?.[0]?.[1], minUpdateIntervalHours))

  if (toFetch.length === 0) {
    console.log('All tracked currencies are already fresh, nothing to do.')
    return
  }

  console.log(`Fetching rates for: ${toFetch.join(', ')}`)

  const updated = Math.round(Date.now() / 1000)
  let sawSuccess = false

  for (const currency of toFetch) {
    try {
      const rate = await fetchRate(currency)
      const currentHistory = history[currency] || []
      currentHistory.unshift([rate, updated])
      history[currency] = currentHistory.slice(0, historySize)
      sawSuccess = true
      console.log(`${currency}: ${rate} per 1 USD`)
    } catch (err) {
      console.error(err.message)
    }
    // Be a good citizen even though this API doesn't enforce tight limits.
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  if (!sawSuccess) {
    console.error('No currencies were successfully updated this run.')
    process.exitCode = 1
    return
  }

  const sortedHistory = Object.fromEntries(
    Object.entries(history).sort(([a], [b]) => a.localeCompare(b))
  )
  const rates = Object.fromEntries(Object.entries(sortedHistory).map(([name, entries]) => [name, entries[0]]))

  await writeFile(HISTORY_FILE, JSON.stringify(sortedHistory, null, 2) + '\n')
  await writeFile(RATES_FILE, JSON.stringify(rates, null, 2) + '\n')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
