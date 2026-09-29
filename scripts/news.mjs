// Pulls candidate articles from GNews for each topic First Serve covers.
// Free GNews plan: 100 requests/day, 10 articles per request. Each run uses 9 requests.

const BASE = "https://gnews.io/api/v4";
const GAP_MS = Number(process.env.GNEWS_GAP_MS ?? 1500);
const RETRY_MS = Number(process.env.GNEWS_RETRY_MS ?? 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each feed maps to a section. "hours" is how far back to look.
export const FEEDS = [
  { topic: "business", kind: "top-headlines", params: { category: "business", country: "us" }, hours: 36 },
  { topic: "markets",  kind: "search", params: { q: '(stocks OR "Wall Street" OR "Federal Reserve" OR earnings OR IPO)' }, hours: 36 },
  { topic: "ai",       kind: "top-headlines", params: { category: "technology", country: "us" }, hours: 36 },
  { topic: "ai",       kind: "search", params: { q: '("artificial intelligence" OR OpenAI OR Anthropic OR Nvidia)' }, hours: 36 },
  { topic: "careers",  kind: "search", params: { q: '(McKinsey OR BCG OR Bain OR Deloitte OR "management consulting")' }, hours: 96 },
  { topic: "careers",  kind: "search", params: { q: '(internship OR internships OR "entry-level" OR "college graduates") AND (hiring OR jobs)' }, hours: 96 },
  { topic: "startups", kind: "search", params: { q: '(startup OR startups) AND (raises OR funding OR "Series A" OR "seed round")' }, hours: 36 },
  { topic: "uci",      kind: "search", params: { q: '"UC Irvine" OR "University of California, Irvine" OR "UCI Anteaters"' }, hours: 24 * 7 },
  { topic: "tennis",   kind: "search", params: { q: 'tennis AND (ATP OR WTA OR "Grand Slam" OR Open)' }, hours: 48 },
];

async function fetchFeed(feed, apiKey, now) {
  const url = new URL(`${BASE}/${feed.kind}`);
  const from = new Date(now.getTime() - feed.hours * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const [k, v] of Object.entries({ lang: "en", max: "10", from, ...feed.params, apikey: apiKey })) {
    url.searchParams.set(k, v);
  }
  if (feed.kind === "search") url.searchParams.set("sortby", "publishedAt");

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GNews ${feed.topic} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.articles || []).map((a) => ({
    topic: feed.topic,
    title: (a.title || "").trim(),
    description: (a.description || "").trim(),
    content: (a.content || "").replace(/\s*\[\d+ chars\]$/, "").trim().slice(0, 700),
    url: a.url,
    source: a.source?.name || new URL(a.url).hostname.replace(/^www\./, ""),
    publishedAt: a.publishedAt,
  }));
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 3);

function similar(a, b) {
  const A = new Set(norm(a)), B = norm(b);
  if (!A.size || !B.length) return false;
  const shared = B.filter((w) => A.has(w)).length;
  return shared / Math.min(A.size, B.length) >= 0.6;
}

// Returns a de-duplicated list with short ids (a1, a2, ...) Claude can cite.
export async function gatherCandidates(apiKey, now = new Date()) {
  // GNews free plan allows about 1 request per second, so fetch one feed at a time.
  const results = [];
  for (const [i, f] of FEEDS.entries()) {
    if (i > 0) await sleep(GAP_MS);
    let r = await fetchFeed(f, apiKey, now).then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
    if (r.status === "rejected" && / 429:/.test(r.reason.message)) {
      await sleep(RETRY_MS); // one retry after a pause if rate-limited
      r = await fetchFeed(f, apiKey, now).then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
    }
    results.push(r);
  }
  const errors = [];
  const all = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else errors.push(`${FEEDS[i].topic}: ${r.reason.message}`);
  });

  const kept = [];
  for (const a of all) {
    if (!a.url || !a.title) continue;
    if (kept.some((k) => k.url === a.url || similar(k.title, a.title))) continue;
    kept.push(a);
  }
  kept.forEach((a, i) => (a.id = `a${i + 1}`));
  return { candidates: kept, errors };
}
