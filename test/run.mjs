// Offline test: runs the full pipeline with GNews, Yahoo Finance, Gemini, and Resend mocked.
// Usage: npm test   (writes to test/out/, never touches data/)

import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolveSlot } from "../scripts/slot.mjs";
import { finalize } from "../scripts/validate.mjs";
import { renderEmail } from "../scripts/email.mjs";
import { gatherCandidates } from "../scripts/news.mjs";
import { getScoreboard, formatRow, asOfLabel } from "../scripts/markets.mjs";
import { buildPrompt, extractJSON } from "../scripts/prompt.mjs";
import { writeWithGemini } from "../scripts/gemini.mjs";
import { installMocks, calls } from "./mocks.mjs";

const fixture = JSON.parse(await readFile(new URL("fixture.json", import.meta.url), "utf8"));

// ---- slot logic across daylight saving ----
const s = (iso) => resolveSlot(new Date(iso))?.id ?? null;
assert.equal(s("2026-09-29T13:05:00Z"), "2026-09-29-am"); // 6:05 AM PDT
assert.equal(s("2026-09-29T18:48:00Z"), "2026-09-29-am"); // 11:48 AM PDT, a late GitHub run still builds the morning edition
assert.equal(s("2026-09-29T23:59:00Z"), "2026-09-29-am"); // 4:59 PM PDT
assert.equal(s("2026-09-30T00:05:00Z"), "2026-09-29-pm"); // 5:05 PM PDT
assert.equal(s("2026-09-30T05:25:00Z"), "2026-09-29-pm"); // 10:25 PM PDT, late run builds the evening edition
assert.equal(s("2026-09-30T12:30:00Z"), "2026-09-29-pm"); // 5:30 AM PDT next day, still the previous evening
assert.equal(s("2026-09-30T13:00:00Z"), "2026-09-30-am"); // 6:00 AM PDT
assert.equal(s("2026-12-15T14:05:00Z"), "2026-12-15-am"); // 6:05 AM PST (winter)
assert.equal(s("2026-12-15T13:30:00Z"), "2026-12-14-pm"); // 5:30 AM PST, previous evening
assert.equal(s("2026-12-16T01:05:00Z"), "2026-12-15-pm"); // 5:05 PM PST
assert.equal(resolveSlot(new Date("2026-09-30T05:25:00Z")).dateLabel, "Tue, Sep 29, 2026");
console.log("✓ slot logic");

// ---- market formatting ----
assert.deepEqual(formatRow({ name: "S&P 500", kind: "index" }, { price: 7665.2, prev: 7688.3 }), { name: "S&P 500", value: "7,665", change: "−0.30%", direction: "down" });
assert.equal(formatRow({ name: "10-yr", kind: "yield" }, { price: 5.28, prev: 5.24 }).change, "+4 bp");
assert.equal(formatRow({ name: "10-yr", kind: "yield" }, { price: 52.8, prev: 52.4 }).value, "5.28%");
assert.equal(formatRow({ name: "Gold", kind: "dollar" }, { price: 4156.56, prev: 4115.4 }).value, "$4,157");
const t = (iso) => Date.parse(iso) / 1000;
assert.equal(asOfLabel(t("2026-09-28T20:00:00Z"), new Date("2026-09-29T13:05:00Z")), "Close, Sep 28");
assert.equal(asOfLabel(t("2026-09-29T15:42:00Z"), new Date("2026-09-29T15:45:00Z")), "11:42 AM ET, Sep 29");
console.log("✓ market formatting");

// ---- full pipeline with mocks ----
installMocks(fixture, { failFirstGeminiModel: true });

const now = new Date("2026-09-29T13:05:00Z");
const slotInfo = resolveSlot(now);
const { candidates, errors } = await gatherCandidates("test-key", now);
assert.equal(errors.length, 0);
assert.ok(candidates.length >= 10, `expected candidates, got ${candidates.length}`);
console.log(`✓ news: ${candidates.length} unique candidates`);

const { scoreboard } = await getScoreboard(now);
assert.equal(scoreboard.rows.length, 5);
assert.equal(scoreboard.asOf, "Close, Sep 28");
console.log(`✓ scoreboard: ${scoreboard.rows.map((r) => `${r.name} ${r.value} ${r.change}`).join(" | ")}`);

const prompt = buildPrompt({ slotInfo, candidates, previousHeadlines: ["Old story"], markets: scoreboard });
assert.ok(prompt.includes("Samrudh") && prompt.includes("[a1]") && prompt.includes("Old story") && prompt.includes("S&P 500"));
const { text, model } = await writeWithGemini({ apiKey: "k", prompt });
assert.equal(model, "gemini-3.5-flash", "should fall back when the first model is rate-limited");
assert.equal(calls.gemini, 2);
console.log(`✓ gemini: fell back to ${model} after a 429`);

const draft = extractJSON(text);
// Inject problems validation must catch.
draft.sections[0].stories.push({ headline: "Made-up story", body: "No real source.", why: "x", sources: ["a999"] });
draft.lead.body += " It is big — really big.";

const { edition, problems } = finalize(draft, candidates, slotInfo, scoreboard);
assert.ok(problems.some((p) => p.includes("Made-up story")), "unsourced story should be dropped");
assert.ok(!JSON.stringify(edition).includes("—"), "em dashes should be removed");
assert.ok(edition.lead.sources[0].url.startsWith("https://"));
assert.equal(edition.id, "2026-09-29-am");
assert.equal(edition.emailItems.length, 5);
assert.equal(edition.scoreboard.rows.length, 5);
console.log(`✓ validation: ${edition.storyCount} stories, dropped ${problems.length} bad item(s)`);

assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(extractJSON('Here you go: {"a":1} thanks'), { a: 1 });
console.log("✓ JSON extraction tolerates stray text");

const email = renderEmail(edition, "https://firstserve.news");
assert.ok(email.subject.startsWith("First Serve: "));
assert.ok(email.html.includes("https://firstserve.news") && email.text.includes("1. "));
console.log(`✓ email: "${email.subject}"`);

await mkdir(new URL("out/", import.meta.url), { recursive: true });
await writeFile(new URL("out/latest.json", import.meta.url), JSON.stringify(edition, null, 2));
await writeFile(new URL("out/email.html", import.meta.url), email.html);
console.log("\nAll tests passed. Output in test/out/");
