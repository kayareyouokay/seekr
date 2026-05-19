import { streamAnswer } from "./gemini";
import { searchWeb } from "./tavily";
import type { ApiError, PipelineOptions, SearchRequest, SSEEvent } from "../types";
import { buildSourcesBlock, parseCitations } from "../utils/citations";
import { logger } from "../utils/logger";

function toErrorEvent(error: unknown): Extract<SSEEvent, { type: "error" }> {
  const apiError = error as Partial<ApiError>;

  if (apiError.message) {
    const event: Extract<SSEEvent, { type: "error" }> = {
      type: "error",
      message: apiError.message
    };

    if (apiError.code) {
      event.code = apiError.code;
    }

    return event;
  }

  return {
    type: "error",
    message: "Search pipeline failed",
    code: "PIPELINE_ERROR"
  };
}

function buildPrompt(request: SearchRequest, sourcesBlock: string): string {
  return `User query: ${request.query}

Search results:
${sourcesBlock}

Answer the query using the above results. Cite sources inline with [N] notation.`;
}

export async function runSearchPipeline(
  request: SearchRequest,
  emit: (event: SSEEvent) => void,
  options: PipelineOptions = {}
): Promise<void> {
  try {
    emit({ type: "status", message: "Searching the web..." });

    const tavilyOptions: Parameters<typeof searchWeb>[1] = {};

    if (request.mode) {
      tavilyOptions.mode = request.mode;
    }

    if (request.focus) {
      tavilyOptions.focus = request.focus;
    }

    if (options.signal) {
      tavilyOptions.signal = options.signal;
    }

    const tavilyResponse = await searchWeb(request.query, tavilyOptions);

    if (options.signal?.aborted) {
      return;
    }

    emit({ type: "sources", data: tavilyResponse.results });

    if (tavilyResponse.images && tavilyResponse.images.length > 0) {
      emit({ type: "images", data: tavilyResponse.images });
    }

    emit({ type: "status", message: "Generating answer..." });

    const prompt = buildPrompt(
      request,
      buildSourcesBlock(tavilyResponse.results)
    );
    let accumulatedText = "";

    for await (const chunk of streamAnswer(
      prompt,
      request.followUp ?? [],
      options.signal
    )) {
      if (options.signal?.aborted) {
        return;
      }

      accumulatedText += chunk;
      emit({ type: "delta", content: chunk });
    }

    parseCitations(accumulatedText, tavilyResponse.results);
    emit({ type: "done" });
  } catch (error) {
    if (options.signal?.aborted) {
      return;
    }

    logger.error({ error }, "search pipeline failed");
    emit(toErrorEvent(error));
  }
}
