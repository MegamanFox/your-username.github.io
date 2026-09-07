// Steam market currency ids.
// @see https://partner.steamgames.com/doc/store/pricing/currencies
export const CURRENCIES = {
  GBP: 2, // United Kingdom Pound
  EUR: 3, // European Union Euro
  CHF: 4, // Swiss Francs
  RUB: 5, // Russian Rouble
  PLN: 6, // Polish Złoty
  BRL: 7, // Brazilian Reals
  JPY: 8, // Japanese Yen
  NOK: 9, // Norwegian Krone
  IDR: 10, // Indonesian Rupiah
  MYR: 11, // Malaysian Ringgit
  PHP: 12, // Philippine Peso
  SGD: 13, // Singapore Dollar
  THB: 14, // Thai Baht
  VND: 15, // Vietnamese Dong
  KRW: 16, // South Korean Won
  TRY: 17, // Turkish Lira
  UAH: 18, // Ukrainian Hryvnia
  MXN: 19, // Mexican Peso
  CAD: 20, // Canadian Dollars
  AUD: 21, // Australian Dollars
  NZD: 22, // New Zealand Dollar
  CNY: 23, // Chinese Renminbi (yuan)
  INR: 24, // Indian Rupee
  CLP: 25, // Chilean Peso
  PEN: 26, // Peruvian Sol
  COP: 27, // Colombian Peso
  ZAR: 28, // South African Rand
  HKD: 29, // Hong Kong Dollar
  TWD: 30, // New Taiwan Dollar
  SAR: 31, // Saudi Riyal
  AED: 32, // United Arab Emirates Dirham
  ARS: 34, // Argentine Peso
  ILS: 35, // Israeli New Shekel
  KZT: 37, // Kazakhstani Tenge
  KWD: 38, // Kuwaiti Dinar
  QAR: 39, // Qatari Riyal
  CRC: 40, // Costa Rican Colón
  UYU: 41 // Uruguayan Peso
}

export const CONFIG = {
  // CS2 app id on Steam.
  steamGameId: '730',
  // A cheap, always-liquid item so there is (almost) always an active listing
  // to price-check. Cases fit well because supply is huge and constant.
  itemMarketName: 'Fracture Case',
  // Which currencies to track, relative to USD.
  currencies: ['EUR', 'GBP', 'UAH', 'PLN', 'BRL'],
  // Max Steam requests per run (USD + up to N-1 tracked currencies).
  // Steam rate-limits aggressively, so keep this conservative.
  rateLimit: 4,
  // How many history points to keep per currency.
  historySize: 150,
  // Default number of history points returned by the site if not specified.
  historyLength: 30,
  // Minimum minutes between updates for a given currency (avoid re-fetching
  // something that was just refreshed if the workflow is run manually).
  minUpdateIntervalMinutes: 25
}
