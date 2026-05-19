# Seekr Backend

Seekr is a Bun + Express backend for a Perplexity-style AI search experience. It searches the web with Tavily, grounds a Gemini answer in those sources, and streams progress plus answer chunks to the frontend over Server-Sent Events.

## Setup

```bash
bun install
cp .env.example .env
```

Fill in `.env`:

```env
GEMINI_API_KEY=your_gemini_key_here
TAVILY_API_KEY=your_tavily_key_here
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
GEMINI_MODEL=gemini-2.0-flash
APP_NAME=Seekr
```

Run locally:

```bash
bun run dev
```

Type-check:

```bash
bun run typecheck
```

## Architecture

```text
Frontend
   |
   | POST /api/search
   v
Express route validation
   |
   v
Search pipeline
   |
   +--> Tavily Search API
   |       |
   |       v
   |    sources + images
   |
   +--> Gemini streaming answer
           |
           v
        SSE events
```

## Endpoints

### `POST /api/search`

Streams an answer as SSE. Validation errors return JSON `400` before the stream opens.

Request:

```json
{
  "query": "what changed in React 19?",
  "mode": "fast",
  "focus": "web",
  "followUp": [
    {
      "role": "user",
      "content": "What is React Compiler?"
    },
    {
      "role": "assistant",
      "content": "React Compiler is..."
    }
  ]
}
```

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `query` | `string` | Required, 1-500 characters |
| `mode` | `"fast" \| "deep"` | Optional. `fast` returns 5 basic Tavily results, `deep` returns 10 advanced results |
| `focus` | `"web" \| "news" \| "academic"` | Optional. `news` sends Tavily `topic: "news"` |
| `followUp` | `Message[]` | Optional prior conversation turns |

SSE response frames are sent as:

```text
data: {"type":"status","message":"Searching the web..."}

```

### `GET /api/suggest?q=react`

Returns five Gemini-generated query suggestions. Results are cached in memory for 5 minutes with a max of 100 entries.

Response:

```json
{
  "suggestions": [
    "React 19 new features",
    "React Compiler explained"
  ]
}
```

### `GET /health`

Response:

```json
{
  "status": "ok",
  "uptime": 42.18,
  "timestamp": 1710000000000
}
```

## SSE Events

| Event type | Payload shape | When it fires |
| --- | --- | --- |
| `status` | `{ "type": "status", "message": string }` | Search and generation phase updates |
| `sources` | `{ "type": "sources", "data": TavilyResult[] }` | After Tavily returns results |
| `images` | `{ "type": "images", "data": string[] }` | After Tavily returns image URLs |
| `delta` | `{ "type": "delta", "content": string }` | For each streamed Gemini text chunk |
| `done` | `{ "type": "done", "totalTokens"?: number }` | When the stream completes |
| `error` | `{ "type": "error", "message": string, "code"?: string }` | When Tavily, Gemini, or the pipeline fails |

`TavilyResult`:

```ts
interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}
```

## Frontend Integration

`/api/search` uses POST, so the practical browser integration is `fetch()` with a stream reader:

```js
const response = await fetch("http://localhost:3001/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "latest TypeScript features",
    mode: "fast",
    focus: "web"
  })
});

if (!response.ok || !response.body) {
  throw new Error("Search request failed");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();

  if (done) {
    break;
  }

  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split("\n\n");
  buffer = frames.pop() ?? "";

  for (const frame of frames) {
    const line = frame.trim();

    if (!line.startsWith("data: ")) {
      continue;
    }

    const event = JSON.parse(line.slice(6));

    if (event.type === "delta") {
      console.log(event.content);
    }
  }
}
```

Native `EventSource` only supports GET. If a frontend adds a GET bridge for search streams, the event consumption looks like this:

```js
const source = new EventSource("/api/search-stream?q=latest%20TypeScript%20features");

source.onmessage = (message) => {
  const event = JSON.parse(message.data);

  if (event.type === "done" || event.type === "error") {
    source.close();
  }
};
```

## Environment

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | None | Google Gemini API key |
| `TAVILY_API_KEY` | Yes | None | Tavily Search API key |
| `PORT` | No | `3001` | HTTP port |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS allowlist |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Gemini model name |
| `APP_NAME` | No | `Seekr` | Logger/app display name |
