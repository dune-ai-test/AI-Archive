export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({ text, query }: { text: string | null; query: string }) {
  if (!text) return null;
  const q = query.trim();
  if (!q) return <>{text}</>;
  const terms = q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map(escapeRegExp);
  let parts: string[];
  try {
    parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));
  } catch {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
      )}
    </>
  );
}
