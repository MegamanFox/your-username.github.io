const state = {
  rates: {}, // { CODE: [rate, updatedTs] }
  history: {} // { CODE: [[rate, ts], ...] }
};

// Rates near 1.0 (EUR, GBP, ...) need extra decimal places to be meaningful;
// larger-magnitude rates (RUB, KZT, JPY, ...) read better at the usual 2
// decimals everyone's used to from prices. Match that convention instead of
// showing every currency at the same fixed precision.
const rateFmtPrecise = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const rateFmtStandard = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtRate(value) {
  return (Math.abs(value) < 1 ? rateFmtPrecise : rateFmtStandard).format(value);
}

// Converted money amounts always read as ordinary prices — 2 decimals, full stop.
const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function loadData() {
  const [ratesRes, historyRes] = await Promise.all([
    fetch("data/rates.json", { cache: "no-store" }),
    fetch("data/history.json", { cache: "no-store" })
  ]);
  state.rates = ratesRes.ok ? await ratesRes.json() : {};
  state.history = historyRes.ok ? await historyRes.json() : {};
}

function timeAgo(ts) {
  if (!ts) return "no data yet";
  const seconds = Math.round(Date.now() / 1000 - ts);
  if (seconds < 60) return "updated just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `updated ${days}d ago`;
}

function renderMeta() {
  const codes = Object.keys(state.rates);
  const latestTs = codes.reduce((max, code) => {
    const ts = state.rates[code]?.[1] || 0;
    return Math.max(max, ts);
  }, 0);
  document.getElementById("updated-meta").textContent = timeAgo(latestTs);
}

function renderTicker() {
  const track = document.getElementById("ticker-track");
  const codes = Object.keys(state.rates);

  if (!codes.length) {
    track.innerHTML = '<span class="ticker__loading">no rates yet — the first scheduled update will populate this</span>';
    return;
  }

  const items = codes
    .map((code) => `<span class="ticker__item">1 USD = <b>${fmtRate(state.rates[code][0])}</b> ${code}</span>`)
    .join("");

  // Duplicate the sequence so the scrolling loop (translateX(-50%)) is seamless.
  track.innerHTML = items + items;
}

function populateSelects() {
  const codes = ["USD", ...Object.keys(state.rates)];
  const from = document.getElementById("from-currency");
  const to = document.getElementById("to-currency");

  for (const select of [from, to]) {
    select.innerHTML = codes.map((c) => `<option value="${c}">${c}</option>`).join("");
  }
  from.value = "USD";
  to.value = codes[1] || "USD";
}

// All stored rates are "1 USD = rate CODE". Convert via USD as the pivot.
function convert(amount, fromCode, toCode) {
  if (fromCode === toCode) return amount;
  const fromRate = fromCode === "USD" ? 1 : state.rates[fromCode]?.[0];
  const toRate = toCode === "USD" ? 1 : state.rates[toCode]?.[0];
  if (!fromRate || !toRate) return null;
  const usd = amount / fromRate;
  return usd * toRate;
}

function renderConversion() {
  const amountInput = document.getElementById("amount");
  const from = document.getElementById("from-currency").value;
  const to = document.getElementById("to-currency").value;
  const amount = parseFloat(amountInput.value.replace(",", "."));
  const result = document.getElementById("result");
  const note = document.getElementById("converter-note");

  if (Number.isNaN(amount)) {
    result.textContent = "–";
    return;
  }

  const converted = convert(amount, from, to);
  if (converted === null) {
    result.textContent = "–";
    note.textContent = "No rate available for that pair yet.";
    return;
  }

  result.textContent = `${moneyFmt.format(converted)} ${to}`;
  note.textContent = `1 ${from} ≈ ${fmtRate(convert(1, from, to))} ${to}, derived from the tracked item's Steam Market price.`;
}

function sparklinePath(points) {
  if (points.length < 2) return null;
  const values = points.map((p) => p[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (points.length - 1);

  const coords = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * h;
    return [x, y];
  });

  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return { d, w, h };
}

function renderRatesTable() {
  const container = document.getElementById("rates-table");
  const codes = Object.keys(state.rates);

  if (!codes.length) {
    container.innerHTML = '<p class="rates__empty">No data yet — the tracker updates on its own schedule. Check back soon.</p>';
    return;
  }

  container.innerHTML = codes
    .map((code) => {
      const history = (state.history[code] || []).slice(0, 30).reverse(); // oldest -> newest
      const latest = state.rates[code][0];
      const previous = history.length > 1 ? history[history.length - 2][0] : null;
      const deltaPct = previous ? ((latest - previous) / previous) * 100 : null;

      let deltaClass = "rate-row__delta--flat";
      let deltaText = "–";
      if (deltaPct !== null) {
        if (deltaPct > 0.01) deltaClass = "rate-row__delta--up";
        else if (deltaPct < -0.01) deltaClass = "rate-row__delta--down";
        deltaText = `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(2)}%`;
      }

      const spark = sparklinePath(history);
      const sparkColor = deltaClass === "rate-row__delta--up" ? "var(--teal)" : deltaClass === "rate-row__delta--down" ? "var(--rose)" : "var(--ink-soft)";
      const sparkSvg = spark
        ? `<svg viewBox="0 0 ${spark.w} ${spark.h}" width="90" height="26" preserveAspectRatio="none">
             <path d="${spark.d}" fill="none" stroke="${sparkColor}" stroke-width="1.6" vector-effect="non-scaling-stroke" />
           </svg>`
        : "";

      return `
        <div class="rate-row">
          <span class="rate-row__code">${code}</span>
          <span class="rate-row__spark">${sparkSvg}</span>
          <span class="rate-row__value">${fmtRate(latest)}</span>
          <span class="rate-row__delta ${deltaClass}">${deltaText}</span>
        </div>`;
    })
    .join("");
}

async function init() {
  await loadData();
  renderMeta();
  renderTicker();
  populateSelects();
  renderConversion();
  renderRatesTable();

  const form = document.getElementById("converter-form");
  form.addEventListener("input", renderConversion);
}

init();
