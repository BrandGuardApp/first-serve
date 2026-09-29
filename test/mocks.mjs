// Fake GNews, Yahoo Finance, Gemini, Claude, and Resend so tests run offline.
// Also usable as a preload for an end-to-end dry run:
//   node --import ./test/mocks.mjs scripts/edition.mjs

import { readFileSync } from "node:fs";

export const calls = { gemini: 0, resend: 0 };

const QUOTES = {
  "^GSPC": { price: 7665.2, prev: 7688.3 },
  "^IXIC": { price: 26793.1, prev: 26841.4 },
  "^DJI": { price: 51205.6, prev: 51535.4 },
  "^TNX": { price: 5.28, prev: 5.24 },
  "GC=F": { price: 4156.56, prev: 4115.4 },
};

// Claude/Gemini cite candidate ids; the fixture cites titles, so map titles to the ids in the prompt.
function draftFor(prompt, fixture) {
  const map = {};
  for (const m of prompt.matchAll(/\[(a\d+)\] \(\w+\) (.+)/g)) map[m[2]] = m[1];
  const d = structuredClone(fixture.draft);
  delete d.scoreboard;
  const r = (o) => o?.sources && (o.sources = o.sources.map((t) => map[t] || "a999"));
  r(d.lead); r(d.term); r(d.serve);
  d.sections.forEach((s) => s.stories.forEach(r));
  return d;
}

export function installMocks(fixture, { failFirstGeminiModel = false } = {}) {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith("https://gnews.io/")) {
      const q = new URL(u).searchParams;
      if (!q.get("apikey") || !q.get("from")) return new Response("bad request", { status: 400 });
      const key = q.get("q") || q.get("category") || "";
      return Response.json({ articles: fixture.gnews.filter((a) => a._match.some((m) => key.includes(m))) });
    }
    if (u.startsWith("https://query1.finance.yahoo.com/")) {
      const sym = decodeURIComponent(u.split("/chart/")[1].split("?")[0]);
      const q = QUOTES[sym];
      if (!q) return new Response("not found", { status: 404 });
      const closeTime = Date.parse("2026-09-28T20:00:00Z") / 1000;
      return Response.json({ chart: { result: [{ meta: { regularMarketPrice: q.price, chartPreviousClose: q.prev, regularMarketTime: closeTime } }] } });
    }
    if (u.startsWith("https://generativelanguage.googleapis.com/")) {
      calls.gemini++;
      if (failFirstGeminiModel && calls.gemini === 1) return new Response('{"error":{"code":429,"message":"quota"}}', { status: 429 });
      const prompt = JSON.parse(opts.body).contents[0].parts[0].text;
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(draftFor(prompt, fixture)) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 14000, candidatesTokenCount: 2600 },
      });
    }
    if (u.startsWith("https://api.anthropic.com/")) {
      const prompt = JSON.parse(opts.body).messages[0].content;
      return Response.json({ content: [{ type: "text", text: JSON.stringify(draftFor(prompt, fixture)) }], usage: { input_tokens: 14000, output_tokens: 2600 } });
    }
    if (u.startsWith("https://api.resend.com/")) {
      calls.resend++;
      console.log(`  [mock resend] to ${JSON.parse(opts.body).to} (idempotency ${opts.headers["Idempotency-Key"]})`);
      return Response.json({ id: `mock-${calls.resend}` });
    }
    throw new Error(`Unexpected fetch ${u}`);
  };
}

// When preloaded with --import, install the mocks automatically.
if (process.env.FIRST_SERVE_MOCK === "1") {
  installMocks(JSON.parse(readFileSync(new URL("fixture.json", import.meta.url), "utf8")));
}
