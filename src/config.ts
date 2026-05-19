const requiredEnvVars = ["GEMINI_API_KEY", "TAVILY_API_KEY"] as const;

function requireEnv(name: (typeof requiredEnvVars)[number]): string {
  const value = process.env[name];

  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3001;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be an integer between 1 and 65535");
    process.exit(1);
  }

  return port;
}

function parseAllowedOrigins(value: string | undefined): string[] | "*" {
  if (!value || value.trim() === "*") {
    return "*";
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config = {
  appName: process.env.APP_NAME ?? "Seekr",
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  tavilyApiKey: requireEnv("TAVILY_API_KEY"),
  port: parsePort(process.env.PORT),
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
} as const;
