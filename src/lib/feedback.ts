const JUNK = ['n/a', 'na', '-', '.', 'none', 'no', 'ok', 'good', 'fine', 'thanks', 'great', 'yes'];

export function isMeaningfulFeedback(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const text = comment.trim().toLowerCase();
  if (text.length < 20) return false;
  if (JUNK.includes(text)) return false;
  if (/^(.)\1+$/.test(text)) return false; // repeated character spam e.g. "aaaaa"
  return true;
}
