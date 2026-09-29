// Checks Claude's draft, swaps candidate ids for real links, and cleans up wording.
// Anything that cites an unknown source is dropped rather than published.

export const SECTION_TITLES = {
  business: "Business & markets",
  ai: "Tech & AI",
  careers: "Consulting & careers",
  uci: "UC Irvine",
  tennis: "Tennis",
};

const clean = (s) =>
  typeof s === "string"
    ? s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*(?=\D)/g, ", ").replace(/\s+/g, " ").trim()
    : "";

function resolveSources(ids, byId) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  return ids
    .map((id) => byId.get(String(id).trim()))
    .filter((a) => a && !seen.has(a.url) && seen.add(a.url))
    .map((a) => ({ name: a.source, url: a.url }));
}

export function finalize(draft, candidates, slotInfo, scoreboard = null) {
  const byId = new Map(candidates.map((a) => [a.id, a]));
  const problems = [];

  const story = (s, where, needWhy) => {
    const sources = resolveSources(s?.sources, byId);
    if (!s?.headline || !s?.body || !sources.length) {
      problems.push(`dropped ${where}: ${s?.headline || "(no headline)"}`);
      return null;
    }
    const out = { headline: clean(s.headline), body: clean(s.body), sources };
    if (s.why && needWhy) out.why = clean(s.why);
    return out;
  };

  const lead = story(draft.lead, "lead", true);
  if (!lead) throw new Error("Lead story missing or has no valid source");
  lead.kicker = clean(draft.lead.kicker || "Top story");
  lead.figures = (draft.lead.figures || [])
    .filter((f) => f?.value && f?.label)
    .slice(0, 3)
    .map((f) => ({ value: clean(f.value), label: clean(f.label) }));

  const sections = [];
  for (const key of Object.keys(SECTION_TITLES)) {
    const src = (draft.sections || []).find((s) => s.key === key);
    const needWhy = !["uci", "tennis"].includes(key);
    const stories = (src?.stories || []).map((s, i) => story(s, `${key}[${i}]`, needWhy)).filter(Boolean);
    if (stories.length) sections.push({ key, title: SECTION_TITLES[key], stories });
  }

  let term = null;
  if (draft.term?.name && draft.term?.definition) {
    term = { name: clean(draft.term.name), definition: clean(draft.term.definition), sources: resolveSources(draft.term.sources, byId) };
  }

  let serve = null;
  const serveSources = resolveSources(draft.serve?.sources, byId);
  if (draft.serve?.headline && serveSources.length) {
    serve = {
      headline: clean(draft.serve.headline),
      body: clean(draft.serve.body),
      questions: (draft.serve.questions || []).map(clean).filter(Boolean).slice(0, 3),
      sources: serveSources,
    };
  } else problems.push("serve dropped: no valid source");

  const emailItems = (draft.emailItems || [])
    .filter((e) => e?.headline)
    .slice(0, 5)
    .map((e) => ({ headline: clean(e.headline), blurb: clean(e.blurb || "") }));

  const storyCount = 1 + sections.reduce((n, s) => n + s.stories.length, 0) + (term ? 1 : 0) + (serve ? 1 : 0);
  const words = JSON.stringify({ lead, sections, term, serve }).split(/\s+/).length;

  const edition = {
    id: slotInfo.id,
    slot: slotInfo.slot,
    date: slotInfo.dateISO,
    dateLabel: slotInfo.dateLabel,
    editionLabel: slotInfo.editionLabel,
    nextLabel: slotInfo.nextLabel,
    generatedAt: new Date().toISOString(),
    greeting: clean(draft.greeting) || (slotInfo.slot === "morning" ? "Morning, Samrudh." : "Evening, Samrudh."),
    preheader: clean(draft.preheader),
    storyCount,
    readMinutes: Math.max(3, Math.round(words / 200)),
    scoreboard,
    lead,
    sections,
    term,
    serve,
    emailItems: emailItems.length ? emailItems : [{ headline: lead.headline, blurb: "" }],
    emailQuestion: clean(draft.emailQuestion) || serve?.questions?.[0] || "",
  };
  return { edition, problems };
}
