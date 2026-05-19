import cors, { type CorsOptions } from "cors";
import express, { type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";

import { config } from "./config";
import { healthRouter } from "./routes/health";
import { searchRouter } from "./routes/search";
import { suggestRouter } from "./routes/suggest";
import { logger } from "./utils/logger";

const app = express();

const corsOptions: CorsOptions = {
  methods: ["GET", "POST", "OPTIONS"],
  origin(origin, callback) {
    if (config.allowedOrigins === "*" || !origin) {
      callback(null, true);
      return;
    }

    callback(null, config.allowedOrigins.includes(origin));
  }
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10kb" }));
app.use(pinoHttp({ logger }));

app.use("/api", searchRouter);
app.use("/api", suggestRouter);
app.use(healthRouter);

const globalErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error({ error }, "unhandled request error");

  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(500).json({ error: "Internal Server Error" });
};

app.use(globalErrorHandler);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `${config.appName} backend listening`);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");

  server.close((error) => {
    if (error) {
      logger.error({ error }, "failed to close server");
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
