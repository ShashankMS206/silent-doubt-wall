import "server-only";
import {
  GEMINI_EMBEDDING_MODEL,
  GEMINI_TEXT_MODEL,
  GEMINI_TEXT_MODEL_FALLBACK,
} from "@/lib/constants";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function headers() {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": process.env.GEMINI_API_KEY!,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 768-dim embedding, normalized so cosine similarity behaves consistently
export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${BASE}/${GEMINI_EMBEDDING_MODEL}:embedContent`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const values: number[] = data.embedding.values;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

// Calls one model, retrying on temporary errors (429 rate limit, 5xx overload)
async function callModel(model: string, prompt: string, attempts = 3): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (res.ok) {
      const data = await res.json();
      // Join all text parts, skipping "thought" parts some models return first
      const parts: { text?: string; thought?: boolean }[] =
        data.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) {
        console.error(
          "Gemini returned no text. finishReason:",
          data.candidates?.[0]?.finishReason,
          "| raw:",
          JSON.stringify(data).slice(0, 500)
        );
      }
      return text;
    }

    const temporary = res.status === 429 || res.status >= 500;
    if (!temporary || i === attempts - 1) {
      throw new Error(`Generate failed (${model}): ${res.status} ${await res.text()}`);
    }
    await sleep(800 * (i + 1)); // wait 0.8s, then 1.6s
  }
  return "";
}

// Tries the main model first, then the fallback model
export async function generateText(prompt: string): Promise<string> {
  try {
    return await callModel(GEMINI_TEXT_MODEL, prompt);
  } catch (e) {
    console.error("Main text model failed, trying fallback:", (e as Error).message.slice(0, 200));
    return await callModel(GEMINI_TEXT_MODEL_FALLBACK, prompt);
  }
}

// Short topic label for a new cluster; falls back to the doubt text if the call fails
export async function labelCluster(doubt: string): Promise<string> {
  try {
    const label = await generateText(
      `Summarize this student's doubt as a topic label of 3 to 6 words. Reply with only the label, no quotes or punctuation.\n\nDoubt: ${doubt}`
    );
    const clean = label.replace(/["\n]/g, "").trim();
    if (!clean) console.error("Label was empty, falling back to raw doubt text");
    return clean ? clean.slice(0, 80) : doubt.slice(0, 50);
  } catch (e) {
    console.error("Label generation failed:", e);
    return doubt.slice(0, 50);
  }
}