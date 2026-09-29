// Market scoreboard from Yahoo Finance's public chart data (free, no key).
// It's an unofficial endpoint, so any failure just hides the scoreboard for that edition.

const SYMBOLS = [
  { symbol: "^GSPC", name: "S&P 500", kind: "index" },
  { symbol: "^IXIC", name: "Nasdaq", kind: "index" },
  { symbol: "^DJI", name: "Dow", kind: "index" },
  { symbol: "^TNX", name: "10-yr Treasury", kind: "yield" },
  { symbol: "GC=F", name: "Gold", kind: "dollar" },
];

const fmt = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (first-serve news brief)" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${symbol} ${res.status}`);
  const meta = (await res.json()).chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice || !meta?.chartPreviousClose) throw new Error(`${symbol} missing price`);
  return { price: meta.regularMarketPrice, prev: meta.chartPreviousClose, time: meta.regularMarketTime };
}

export function formatRow(def, q) {
  if (def.kind === "yield") {
    // ^TNX has been quoted both as the yield (4.28) and as yield x 10 (42.8).
    const scale = q.price > 20 ? 10 : 1;
    const y = q.price / scale, bp = Math.round(((q.price - q.prev) / scale) * 100);
    return { name: def.name, value: `${y.toFixed(2)}%`, change: `${bp > 0 ? "+" : bp < 0 ? "−" : ""}${Math.abs(bp)} bp`, direction: bp > 0 ? "up" : bp < 0 ? "down" : "flat" };
  }
  const pct = ((q.price - q.prev) / q.prev) * 100;
  const r = Math.round(pct * 100) / 100;
  return {
    name: def.name,
    value: def.kind === "dollar" ? `$${fmt(q.price)}` : fmt(q.price),
    change: `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}%`,
    direction: r > 0 ? "up" : r < 0 ? "down" : "flat",
  };
}

// Labels the numbers "Close, Sep 28" or "11:42 AM ET, Sep 29", depending on whether the market is open.
export function asOfLabel(unixSeconds, now = new Date()) {
  const t = new Date(unixSeconds * 1000);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(t);
  const ageMin = (now - t) / 60000;
  const etHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(t));
  if (ageMin > 30 || etHour >= 16) return `Close, ${day}`;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(t);
  return `${time} ET, ${day}`;
}

export async function getScoreboard(now = new Date()) {
  const results = await Promise.allSettled(SYMBOLS.map((s) => quote(s.symbol)));
  const rows = [];
  let latest = 0;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    rows.push(formatRow(SYMBOLS[i], r.value));
    if (SYMBOLS[i].kind === "index") latest = Math.max(latest, r.value.time || 0);
  });
  const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
  if (rows.length < 3 || !latest) return { scoreboard: null, failed };
  return { scoreboard: { asOf: asOfLabel(latest, now), rows }, failed };
}
