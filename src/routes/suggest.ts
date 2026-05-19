import { Router, type NextFunction, type Request, type Response } from "express";

import { generateText } from "../services/gemini";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 100;

interface CacheEntry {
  suggestions: string[];
  expiresAt: number;
}

export const suggestRouter = Router();

const cache = new Map<string, CacheEntry>();

function getCachedSuggestions(key: string): string[] | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  cache.delete(key);
  cache.set(key, entry);

  return entry.suggestions;
}

function setCachedSuggestions(key: string, suggestions: string[]): void {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, {
    suggestions,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    cache.delete(oldestKey);
  }
}

function parseSuggestions(text: string): string[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  const parsed: unknown = JSON.parse(text.slice(start, end + 1));

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 5);
}

suggestRouter.get(
  "/suggest",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawQuery = req.query.q;

    if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
      res.status(400).json({ error: "q is required" });
      return;
    }

    const query = rawQuery.trim();
    const cacheKey = query.toLowerCase();
    const cached = getCachedSuggestions(cacheKey);

    if (cached) {
      res.json({ suggestions: cached });
      return;
    }

    try {
      const prompt = `Generate 5 search query suggestions related to: "${query}"
Return ONLY a JSON array of strings. No explanation.`;
      const text = await generateText(prompt);
      const suggestions = parseSuggestions(text);

      setCachedSuggestions(cacheKey, suggestions);
      res.json({ suggestions });
    } catch (error) {
      next(error);
    }
  }
);
