// Works out which edition (morning or evening) a run should produce, using
// Los Angeles time so daylight saving changes are handled automatically.

const TZ = "America/Los_Angeles";

function laParts(now) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, hour: Number(p.hour), weekday: p.weekday };
}

// Morning runs are accepted from 4:00 to 10:59 AM PT and evening runs from 3:00 to 9:59 PM PT.
// The workflow fires twice per slot (one UTC hour apart) so one of them always lands
// in the window; the second run sees the edition already exists and exits.
export function resolveSlot(now = new Date(), forced = "") {
  const la = laParts(now);
  let slot = null;
  if (forced === "morning" || forced === "evening") slot = forced;
  else if (la.hour >= 4 && la.hour < 11) slot = "morning";
  else if (la.hour >= 15 && la.hour < 22) slot = "evening";
  if (!slot) return null;

  const dateISO = `${la.y}-${la.m}-${la.d}`;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(now);
  return {
    slot,
    dateISO,
    id: `${dateISO}-${slot === "morning" ? "am" : "pm"}`,
    dateLabel,                                   // e.g. "Tue, Sep 29, 2026"
    editionLabel: slot === "morning" ? "Morning edition" : "Evening edition",
    nextLabel: slot === "morning" ? "Next edition: 5:00 PM PT" : "Next edition: tomorrow, 6:00 AM PT",
  };
}
