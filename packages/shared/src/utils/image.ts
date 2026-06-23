export function sanitizeImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return undefined;
  }

  // Discord embeds often fail to render SVG logos reliably.
  if (lower.includes(".svg") || lower.includes("image/svg+xml")) {
    return undefined;
  }

  return trimmed;
}
