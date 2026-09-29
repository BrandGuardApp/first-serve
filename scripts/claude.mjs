// Optional: writes the edition with the Claude API instead of Gemini.
// Set the LLM_PROVIDER variable to "claude" and add ANTHROPIC_API_KEY to use it (about $3-5/month).

const API = "https://api.anthropic.com/v1/messages";

export async function writeWithClaude({ apiKey, model = "claude-sonnet-5-5", prompt }) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, model, usage: { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0 } };
}
