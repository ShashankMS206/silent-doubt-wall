// Starter list. Extend it before the demo if you like.
const BLOCKED = ["fuck", "shit", "bitch", "asshole", "bastard", "dick", "slut"];

export function checkDoubtText(text: string): string | null {
  const lower = text.toLowerCase();
  if (BLOCKED.some((w) => lower.includes(w))) {
    return "Please keep doubts respectful.";
  }
  if (/(.)\1{9,}/.test(text)) {
    return "That looks like spam.";
  }
  return null;
}