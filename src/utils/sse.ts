import type { Response } from "express";

import type { SSEEvent } from "../types";

export function setupSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

export function sendEvent(res: Response, event: SSEEvent): void {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function closeSSE(res: Response): void {
  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
}
