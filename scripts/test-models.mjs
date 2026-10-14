// Run: node --env-file=.env.local scripts/test-models.mjs
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY not loaded from .env.local");

const base = "https://generativelanguage.googleapis.com/v1beta";
const headers = { "Content-Type": "application/json", "x-goog-api-key": key };

const list = await fetch(`${base}/models?pageSize=200`, { headers }).then((r) => r.json());
const available = (list.models ?? [])
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/.test(m.name))
  .map((m) => m.name.replace("models/", ""));

// Also try the two names currently in constants.ts
const names = [...new Set(["gemini-3.8-flash", "gemini-flash-latest", ...available])].slice(0, 10);
console.log("Testing:", names.join(", "), "\n");

for (const name of names) {
  const res = await fetch(`${base}/models/${name}:generateContent`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with one word: hello" }] }] }),
  });
  const body = await res.json().catch(() => ({}));
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
  console.log(`${res.status}  ${name}  ${res.ok ? `-> "${text}"` : (body.error?.message ?? "").slice(0, 90)}`);
}