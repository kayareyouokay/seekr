export interface SearchRequest {
  query: string;
  mode?: "fast" | "deep";
  focus?: "web" | "news" | "academic";
  followUp?: Message[];
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export interface TavilyResponse {
  results: TavilyResult[];
  images?: string[];
  answer?: string;
}

export type SSEEvent =
  | { type: "status"; message: string }
  | { type: "sources"; data: TavilyResult[] }
  | { type: "images"; data: string[] }
  | { type: "delta"; content: string }
  | { type: "done"; totalTokens?: number }
  | { type: "error"; message: string; code?: string };

export interface PipelineOptions {
  signal?: AbortSignal;
}

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}
