import "server-only";
import { generateText } from "@/lib/gemini";

export type Candidate = { clusterId: string; label: string; examples: string[] };

// Returns a cluster id, "NEW", or null if the model call or parsing failed
export async function judgeCluster(
  doubt: string,
  candidates: Candidate[]
): Promise<string | null> {
  const topics = candidates
    .map(
      (c, i) =>
        `${i + 1}. "${c.label}" (for example: ${c.examples.map((e) => `"${e}"`).join("; ")})`
    )
    .join("\n");

  const prompt = `A student posted a doubt during a lecture. Decide whether it is the same specific confusion as one of the existing topics, just worded differently, or a different concept.

Existing topics:
${topics}

New doubt: "${doubt}"

Choose a topic only if the doubt is about the same specific concept. If it is about a related but different concept (even in the same subject), answer NEW.
Reply with only the topic number, or NEW.`;

  try {
    const answer = (await generateText(prompt)).trim().toUpperCase();
    if (answer.startsWith("NEW")) return "NEW";
    const n = parseInt(answer.match(/\d+/)?.[0] ?? "", 10);
    if (n >= 1 && n <= candidates.length) return candidates[n - 1].clusterId;
    console.warn("[cluster] unparseable judge answer:", answer);
    return null;
  } catch (e) {
    console.error("[cluster] judge call failed:", e);
    return null;
  }
}