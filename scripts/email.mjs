// Renders the morning email (table layout, inline styles for Gmail) and sends it with Resend.

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail(ed, siteUrl) {
  const shortDate = ed.dateLabel.replace(/, \d{4}$/, "");
  const items = ed.emailItems.map((it, i) => {
    const last = i === ed.emailItems.length - 1;
    return `<tr><td valign="top" style="padding:10px 12px 10px 0;font-family:Arial,sans-serif;font-weight:bold;color:#2B5A8A;width:18px;">${i + 1}</td><td style="padding:10px 0;${last ? "" : "border-bottom:1px solid #D6DEE7;"}"><strong>${esc(it.headline)}</strong>${it.blurb ? " " + esc(it.blurb) : ""}</td></tr>`;
  }).join("\n");

  const board = ed.scoreboard
    ? ed.scoreboard.rows.slice(0, 3).map((r) => `${esc(r.name)} ${esc(r.value)}${r.change ? ` (${esc(r.change)})` : ""}`).join(" · ")
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>First Serve · ${esc(shortDate)}</title></head>
<body style="margin:0;padding:0;background:#F2F5F8;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(ed.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F8;"><tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D6DEE7;border-radius:6px;">
<tr><td style="padding:22px 24px 14px;border-bottom:3px solid #13233A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:Arial Narrow,Arial,sans-serif;font-weight:bold;font-size:20px;letter-spacing:2px;color:#13233A;text-transform:uppercase;">&#9679; First Serve</td>
<td align="right" style="font-family:Menlo,Consolas,monospace;font-size:12px;color:#5A6B80;">${esc(shortDate)}</td>
</tr></table></td></tr>
<tr><td style="padding:20px 24px 4px;font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#13233A;">${esc(ed.greeting)} Five things worth knowing today:</td></tr>
<tr><td style="padding:8px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Georgia,serif;font-size:16px;line-height:1.45;color:#13233A;">
${items}
</table></td></tr>
${ed.emailQuestion ? `<tr><td style="padding:10px 24px 4px;font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#13233A;"><span style="background:#D6EE3F;padding:1px 4px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Your serve</span>&nbsp; ${esc(ed.emailQuestion)}</td></tr>` : ""}
<tr><td align="center" style="padding:22px 24px 26px;"><a href="${esc(siteUrl)}" style="display:inline-block;background:#2B5A8A;color:#FFFFFF;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:4px;">Read the full brief · ${ed.readMinutes} min</a></td></tr>
${board ? `<tr><td style="padding:14px 24px;border-top:1px solid #D6DEE7;font-family:Arial,sans-serif;font-size:12px;color:#5A6B80;">${board}</td></tr>` : ""}
</table></td></tr></table>
</body></html>`;

  const text = [
    `FIRST SERVE · ${shortDate}`,
    "",
    `${ed.greeting} Five things worth knowing today:`,
    "",
    ...ed.emailItems.map((it, i) => `${i + 1}. ${it.headline}${it.blurb ? " " + it.blurb : ""}`),
    "",
    ed.emailQuestion ? `Your serve: ${ed.emailQuestion}` : "",
    "",
    `Read the full brief: ${siteUrl}`,
  ].join("\n");

  const subject = `First Serve: ${ed.emailItems[0]?.headline.replace(/\.$/, "") || shortDate}`;
  return { subject: subject.slice(0, 120), html, text };
}

export async function sendEmail({ apiKey, from, to, edition, siteUrl }) {
  const { subject, html, text } = renderEmail(edition, siteUrl);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `first-serve-${edition.id}`, // never sends the same edition twice
    },
    body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()).filter(Boolean), subject, html, text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
