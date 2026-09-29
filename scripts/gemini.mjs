// Writes the edition with Google's Gemini API (free tier).
// Tries each model in order, moving on if one is rate-limited or unavailable.
// Note: on the free tier Google may use prompts to improve its products. That's fine here:
// the input is public news articles.

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

export async function writeWithGemini({ apiKey, prompt, models = DEFAULT_MODELS }) {
  const errors = [];
  for (const model of models) {
    try {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 12000 },
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        // 429 = rate limit, 404 = model not available, 5xx = temporary. Try the next model.
        if ([404, 429, 500, 503].includes(res.status)) { errors.push(`${model} ${res.status}: ${body}`); continue; }
        throw new Error(`Gemini ${model} ${res.status}: ${body}`);
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
      if (!text) { errors.push(`${model}: empty reply (${cand?.finishReason || data.promptFeedback?.blockReason || "unknown"})`); continue; }
      return {
        text,
        model,
        usage: { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 },
      };
    } catch (err) {
      if (err.name === "TimeoutError") { errors.push(`${model}: timed out`); continue; }
      throw err;
    }
  }
  throw new Error(`All Gemini models failed:\n  ${errors.join("\n  ")}`);
}
