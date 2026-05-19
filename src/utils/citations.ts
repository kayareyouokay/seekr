import type { TavilyResult } from "../types";

export function parseCitations(text: string, sources: TavilyResult[]): string {
  return text.replace(/\[(\d+)]/g, (match, rawIndex: string) => {
    const index = Number(rawIndex);
    const source = sources[index - 1];

    if (!Number.isInteger(index) || index < 1 || !source) {
      return match;
    }

    return `[[${index}]](${source.url})`;
  });
}

export function buildSourcesBlock(sources: TavilyResult[]): string {
  return sources
    .map((source, index) => {
      const publishedDate = source.published_date
        ? ` Published: ${source.published_date}.`
        : "";

      return `[${index + 1}] Title: ${source.title}\nURL: ${source.url}\nContent: ${source.content}${publishedDate}`;
    })
    .join("\n\n");
}
