// The instructions the AI writer gets for each edition. Shared by every provider.

export const READER = `Samrudh is 18 and a first-year student at UC Irvine's Paul Merage School of Business.
He is interested in consulting, investing, and startups, and he plays and follows tennis.
He doesn't read the news on his own, so this brief has to be quick, clear, and useful to him.`;

const SCHEMA = `{
  "greeting": "short greeting using his first name, e.g. \\"Morning, Samrudh.\\" or \\"Evening, Samrudh.\\"",
  "preheader": "one line under 110 characters previewing the top stories, used as the email preview text",
  "lead": {
    "kicker": "section and theme, e.g. \\"AI + IPOs\\"",
    "headline": "...",
    "body": "2-3 sentences",
    "figures": [ { "value": "$4.6B", "label": "2025 revenue" } ],
    "why": "1-2 sentences",
    "sources": ["a3"]
  },
  "sections": [
    { "key": "business", "stories": [ { "headline": "...", "body": "1-2 sentences", "why": "1-2 sentences", "sources": ["a1"] } ] },
    { "key": "ai", "stories": [] },
    { "key": "careers", "stories": [] },
    { "key": "uci", "stories": [] },
    { "key": "tennis", "stories": [] }
  ],
  "term": { "name": "investing or business term", "definition": "2-4 sentences, tied to something in today's news", "sources": ["a5"] },
  "serve": {
    "headline": "a startup from today's news, e.g. \\"Atomic raised $12.5M to fix inventory planning\\"",
    "body": "2 sentences: what the company does and who funded it",
    "questions": ["three short questions that get him thinking like a founder, tied to his life at UCI"],
    "sources": ["a9"]
  },
  "emailItems": [ { "headline": "bold lead-in sentence", "blurb": "one short follow-up sentence" } ],
  "emailQuestion": "the first serve question, reused in the email"
}`;

export function buildPrompt({ slotInfo, candidates, previousHeadlines = [], markets = null }) {
  const list = candidates.map((a) =>
    `[${a.id}] (${a.topic}) ${a.title}\n  Source: ${a.source} | ${a.publishedAt}\n  ${a.description}\n  ${a.content}`
  ).join("\n\n");

  const marketLines = markets?.rows?.length
    ? `\nMarket numbers (${markets.asOf}), for context only. They are shown separately, so don't repeat them as a story:\n${markets.rows.map((r) => `- ${r.name}: ${r.value} (${r.change})`).join("\n")}\n`
    : "";

  return `You write First Serve, a personal news brief. This is the ${slotInfo.editionLabel.toLowerCase()} for ${slotInfo.dateLabel}.

About the reader:
${READER}

Your job:
1. From the candidate articles below, choose the 8 to 11 stories that matter most to him. Aim for: 1 lead story, 2 business and markets, 2 tech and AI, 1 or 2 consulting and careers, 1 UC Irvine (only if there's real UCI news), 1 tennis (only if there's a notable result or story).
2. Pick one startup funding story for "serve", and one investing or business term that today's news makes relevant.

Rules:
- Only state facts that appear in the candidate articles. Never invent numbers, names, or quotes.
- Every story, the lead, the term, and serve must cite candidate ids in "sources" (like "a4"). Only cite ids from the list below.
- Write plainly, like a smart older cousin explaining it. Short sentences. Explain any jargon in a few words.
- "why" says what the story means for him specifically: his classes, future internships, investing, or starting a company. Keep it concrete. Don't lecture.
- Don't use em dashes. Don't use hype words like "game-changer", "revolutionary", or "seismic".
- The lead gets 0 to 3 "figures", only if the article gives real numbers.
- UCI and tennis stories don't need a "why".
- Leave a section's "stories" empty if nothing good fits. Don't pad.
- "emailItems" has exactly 5 entries: the lead plus the four next-best stories.
${previousHeadlines.length ? `\nThese ran in the previous edition. Don't repeat them unless there is a real new development:\n${previousHeadlines.map((h) => `- ${h}`).join("\n")}\n` : ""}${marketLines}
Candidate articles:

${list}

Reply with only the edition as a JSON object, matching this shape exactly:
${SCHEMA}`;
}

// Pulls the JSON object out of a reply, tolerating code fences or stray text around it.
export function extractJSON(text) {
  const tagged = text.match(/<edition>([\s\S]*?)<\/edition>/);
  let raw = (tagged ? tagged[1] : text).replace(/^\s*```(?:json)?/, "").replace(/```\s*$/, "").trim();
  if (!raw.startsWith("{")) {
    const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }
  return JSON.parse(raw);
}
