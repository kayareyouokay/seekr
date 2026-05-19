import { GoogleGenerativeAI, type Content } from "@google/generative-ai";

import { config } from "../config";
import type { Message } from "../types";

const GEMINI_TIMEOUT_MS = 30_000;

const systemInstruction = `You are Seekr, an AI-powered search assistant. Answer questions using ONLY
the provided search results. Be accurate, concise, and cite sources inline
using [1], [2] notation matching the order of sources provided.
If the search results don't contain enough information, say so clearly.
Format responses in clean markdown. Never fabricate information.`;

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

export class GeminiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 502, code = "GEMINI_ERROR") {
    super(message);
    this.name = "GeminiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getModel() {
  return genAI.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction
  });
}

function formatHistory(history: Message[]): Content[] {
  return history.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new GeminiError("Gemini request timed out", 504, "GEMINI_TIMEOUT"));
    }, timeoutMs);

    const abort = (): void => {
      reject(new GeminiError("Gemini request was aborted", 499, "GEMINI_ABORTED"));
    };

    signal?.addEventListener("abort", abort, { once: true });

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      });
  });
}

export async function* streamAnswer(
  prompt: string,
  history: Message[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  try {
    const chat = getModel().startChat({ history: formatHistory(history) });
    const result = await withTimeout(
      chat.sendMessageStream(prompt),
      GEMINI_TIMEOUT_MS,
      signal
    );

    for await (const chunk of result.stream) {
      if (signal?.aborted) {
        throw new GeminiError("Gemini stream was aborted", 499, "GEMINI_ABORTED");
      }

      const text = chunk.text();

      if (text) {
        yield text;
      }
    }
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Gemini request failed";
    throw new GeminiError(message);
  }
}

export async function generateText(prompt: string, signal?: AbortSignal): Promise<string> {
  try {
    const result = await withTimeout(
      getModel().generateContent(prompt),
      GEMINI_TIMEOUT_MS,
      signal
    );

    return result.response.text();
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Gemini request failed";
    throw new GeminiError(message);
  }
}
