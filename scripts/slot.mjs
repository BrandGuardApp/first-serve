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

// Every run builds whichever edition is currently due:
//   6:00 AM to 4:59 PM PT  -> today's morning edition
//   5:00 PM to 5:59 AM PT  -> the evening edition (dated the day it started)
// GitHub's scheduler can start runs hours late or skip them, so the workflow checks
// hourly. Each run exits early if the due edition already exists, so the edition
// goes out on the first run after 6 AM or 5 PM, however late GitHub is.
const DAY_START_HOUR = 6;
const EVENING_HOUR = 17;

export function resolveSlot(now = new Date(), forced = "") {
  // Shift the clock back so the "edition day" runs 6 AM to 6 AM.
  const shifted = new Date(now.getTime() - DAY_START_HOUR * 3600 * 1000);
  const la = laParts(shifted);
  const hourOfEditionDay = la.hour; // 0 = 6 AM, 11 = 5 PM
  let slot = hourOfEditionDay < EVENING_HOUR - DAY_START_HOUR ? "morning" : "evening";
  if (forced === "morning" || forced === "evening") slot = forced;
  now = shifted; // date labels follow the edition day
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
