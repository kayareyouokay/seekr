import { config } from "../config";
import type { TavilyResponse, TavilyResult } from "../types";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 8_000;

export interface TavilySearchOptions {
  mode?: "fast" | "deep";
  focus?: "web" | "news" | "academic";
  signal?: AbortSignal;
}

export class TavilyError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code = "TAVILY_ERROR") {
    super(message);
    this.name = "TavilyError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function normalizeResult(value: unknown): TavilyResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = asString(value.title);
  const url = asString(value.url);
  const content = asString(value.content);
  const score = asNumber(value.score);

  if (!title || !url || !content || score === undefined) {
    return null;
  }

  const result: TavilyResult = { title, url, content, score };
  const publishedDate = asString(value.published_date);

  if (publishedDate) {
    result.published_date = publishedDate;
  }

  return result;
}

function normalizeResponse(value: unknown): TavilyResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return { results: [] };
  }

  const results = value.results
    .map(normalizeResult)
    .filter((result): result is TavilyResult => result !== null);

  const response: TavilyResponse = { results };

  if (Array.isArray(value.images)) {
    response.images = value.images.filter(
      (image): image is string => typeof image === "string"
    );
  }

  const answer = asString(value.answer);

  if (answer) {
    response.answer = answer;
  }

  return response;
}

function buildSearchBody(query: string, options: TavilySearchOptions): Record<string, unknown> {
  const mode = options.mode ?? "fast";
  const focus = options.focus ?? "web";
  const body: Record<string, unknown> = {
    api_key: config.tavilyApiKey,
    query,
    search_depth: mode === "deep" ? "advanced" : "basic",
    max_results: mode === "deep" ? 10 : 5,
    include_images: true,
    include_answer: true
  };

  if (focus === "news") {
    body.topic = "news";
  }

  return body;
}

export async function searchWeb(
  query: string,
  options: TavilySearchOptions = {}
): Promise<TavilyResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  const abortFromCaller = (): void => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSearchBody(query, options)),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new TavilyError(
        responseText || `Tavily search failed with status ${response.status}`,
        response.status
      );
    }

    return normalizeResponse(await response.json());
  } catch (error) {
    if (error instanceof TavilyError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TavilyError("Tavily search timed out", 408, "TAVILY_TIMEOUT");
    }

    const message = error instanceof Error ? error.message : "Tavily search failed";
    throw new TavilyError(message, 502);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
