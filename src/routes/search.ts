import { Router, type NextFunction, type Request, type Response } from "express";

import { runSearchPipeline } from "../services/pipeline";
import type { Message, SearchRequest } from "../types";
import { closeSSE, sendEvent, setupSSE } from "../utils/sse";

export const searchRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
}

function parseSearchRequest(body: unknown): SearchRequest | string {
  if (!isRecord(body)) {
    return "Request body must be a JSON object";
  }

  if (typeof body.query !== "string") {
    return "query is required";
  }

  const query = body.query.trim();

  if (query.length < 1 || query.length > 500) {
    return "query must be between 1 and 500 characters";
  }

  const request: SearchRequest = { query };

  if (body.mode !== undefined) {
    if (body.mode !== "fast" && body.mode !== "deep") {
      return "mode must be fast or deep";
    }

    request.mode = body.mode;
  }

  if (body.focus !== undefined) {
    if (body.focus !== "web" && body.focus !== "news" && body.focus !== "academic") {
      return "focus must be web, news, or academic";
    }

    request.focus = body.focus;
  }

  if (body.followUp !== undefined) {
    if (!Array.isArray(body.followUp) || !body.followUp.every(isMessage)) {
      return "followUp must be an array of user and assistant messages";
    }

    request.followUp = body.followUp;
  }

  return request;
}

searchRouter.post(
  "/search",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = parseSearchRequest(req.body);

    if (typeof parsed === "string") {
      res.status(400).json({ error: parsed });
      return;
    }

    const controller = new AbortController();
    let completed = false;

    req.on("close", () => {
      if (!completed) {
        controller.abort();
      }
    });

    try {
      setupSSE(res);
      await runSearchPipeline(
        parsed,
        (event) => sendEvent(res, event),
        { signal: controller.signal }
      );
    } catch (error) {
      next(error);
      return;
    } finally {
      completed = true;
      closeSSE(res);
    }
  }
);
