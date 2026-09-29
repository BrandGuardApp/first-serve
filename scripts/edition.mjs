// First Serve: builds one edition.
// 1. Work out the slot (morning/evening) in Pacific time; exit if it's already done.
// 2. Pull candidate articles from GNews and market numbers from Yahoo Finance.
// 3. Have the AI writer (Gemini free tier by default) choose and write the stories.
// 4. Validate, then save data/latest.json and data/editions/<id>.json.
// 5. Morning only: email the top 5 to Samrudh.
//
// Env: GEMINI_API_KEY, GNEWS_API_KEY, RESEND_API_KEY, EMAIL_TO, EMAIL_FROM, SITE_URL
// Optional: LLM_PROVIDER=gemini|claude (default gemini), GEMINI_MODELS (comma list),
//           ANTHROPIC_API_KEY + CLAUDE_MODEL (if provider is claude),
//           FORCE_SLOT=morning|evening, DRY_RUN=1 (write files, skip email), SKIP_EMAIL=1,
//           NOW=<ISO time, for testing>

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolveSlot } from "./slot.mjs";
import { gatherCandidates } from "./news.mjs";
import { getScoreboard } from "./markets.mjs";
import { buildPrompt, extractJSON } from "./prompt.mjs";
import { writeWithGemini } from "./gemini.mjs";
import { writeWithClaude } from "./claude.mjs";
import { finalize } from "./validate.mjs";
import { sendEmail } from "./email.mjs";

const env = process.env;
const DATA = new URL("../data/", import.meta.url);
const exists = (p) => access(p).then(() => true, () => false);

function need(name) {
  if (!env[name]) throw new Error(`Missing ${name}. Add it as a GitHub Actions secret.`);
  return env[name];
}

function writer(prompt) {
  if ((env.LLM_PROVIDER || "gemini") === "claude") {
    return writeWithClaude({ apiKey: need("ANTHROPIC_API_KEY"), model: env.CLAUDE_MODEL || undefined, prompt });
  }
  const models = env.GEMINI_MODELS ? env.GEMINI_MODELS.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  return writeWithGemini({ apiKey: need("GEMINI_API_KEY"), prompt, models });
}

async function main() {
  const now = env.NOW ? new Date(env.NOW) : new Date();
  const slotInfo = resolveSlot(now, env.FORCE_SLOT || "");
  if (!slotInfo) {
    console.log(`No edition due at ${now.toISOString()} (outside the morning and evening windows).`);
    return;
  }
  const editionFile = new URL(`editions/${slotInfo.id}.json`, DATA);
  if (!env.FORCE_SLOT && (await exists(editionFile))) {
    console.log(`Edition ${slotInfo.id} already exists. Nothing to do.`);
    return;
  }
  console.log(`Building ${slotInfo.id} (${slotInfo.editionLabel}, ${slotInfo.dateLabel})`);

  const [{ candidates, errors }, { scoreboard, failed }] = await Promise.all([
    gatherCandidates(need("GNEWS_API_KEY"), now),
    getScoreboard(now).catch((e) => ({ scoreboard: null, failed: [e.message] })),
  ]);
  errors.forEach((e) => console.warn(`  feed warning: ${e}`));
  failed.forEach((e) => console.warn(`  market warning: ${e}`));
  console.log(`  ${candidates.length} candidate articles; scoreboard ${scoreboard ? `${scoreboard.rows.length} rows (${scoreboard.asOf})` : "unavailable"}`);
  if (candidates.length < 8) throw new Error("Too few articles from GNews to build an edition");

  let previousHeadlines = [];
  try {
    const prev = JSON.parse(await readFile(new URL("latest.json", DATA), "utf8"));
    previousHeadlines = [prev.lead, ...prev.sections.flatMap((s) => s.stories)].map((s) => s.headline);
  } catch { /* first run */ }

  // Check the writer's key up front so a missing secret fails fast.
  need((env.LLM_PROVIDER || "gemini") === "claude" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY");
  const prompt = buildPrompt({ slotInfo, candidates, previousHeadlines, markets: scoreboard });

  let edition, problems;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text, model, usage } = await writer(prompt);
      console.log(`  written by ${model}: ${usage.input_tokens} in / ${usage.output_tokens} out tokens`);
      ({ edition, problems } = finalize(extractJSON(text), candidates, slotInfo, scoreboard));
      break;
    } catch (err) {
      console.warn(`  attempt ${attempt} failed: ${err.message}`);
      if (attempt === 2) throw err;
    }
  }
  problems.forEach((p) => console.warn(`  fixed: ${p}`));

  await mkdir(new URL("editions/", DATA), { recursive: true });
  const json = JSON.stringify(edition, null, 2) + "\n";
  await writeFile(editionFile, json);
  await writeFile(new URL("latest.json", DATA), json);
  console.log(`  saved: ${edition.storyCount} stories, ~${edition.readMinutes} min read`);

  if (slotInfo.slot === "morning" && !env.DRY_RUN && !env.SKIP_EMAIL) {
    const result = await sendEmail({
      apiKey: need("RESEND_API_KEY"),
      from: need("EMAIL_FROM"),
      to: need("EMAIL_TO"),
      edition,
      siteUrl: env.SITE_URL || "https://firstserve.news",
    });
    console.log(`  email sent (${result.id})`);
  }
}

main().catch((err) => {
  console.error(`First Serve failed: ${err.message}`);
  process.exit(1);
});
