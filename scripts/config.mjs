export const CONFIG = {
  // Which currencies to track, relative to USD. Any ISO 4217 code Frankfurter
  // supports works here — see https://api.frankfurter.dev/v2/currencies
  currencies: ['EUR', 'GBP', 'UAH', 'KZT', 'RUB', 'BRL'],
  // How many history points to keep per currency.
  historySize: 150,
  // Frankfurter's underlying data (ECB + partner central banks) only
  // updates once a day on business days, so there's no point checking more
  // often than this.
  minUpdateIntervalHours: 20
}
