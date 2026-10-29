import { assertStagingIsolation, isStagingMode, stagingFlagProblem } from "./stagingGuard";
import dotenv from "dotenv";

// Keys filled in from a .env file (staging refuses to start with any: it must
// run on its own environment only, never inherit another one's values).
let dotenvKeys = Object.keys(dotenv.config().parsed ?? {});
export function setDotenvKeysForTests(keys: string[]): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test only");
  dotenvKeys = keys;
}

export type NodeEnv = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  mongoUri: string;
  databaseUrl?: string;
  databaseSslRejectUnauthorized: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtIssuer: string;
  jwtAudience: string;
  bcryptRounds: number;
  frontendUrl?: string;
  corsAllowedOrigins: string[];
  trustProxy: boolean | number;
  requestBodyLimit: string;
  formBodyLimit: string;
  uploadDir: string;
  serveLocalUploads: boolean;
  demoModeEnabled: boolean;
  enaraOrchestratorUrl?: string;
  enaraApiKey?: string;
  /** Orchestrator course used when a curriculum isn't linked to one. */
  enaraDefaultCourseId?: string;
  /** Claude is the tutor backup when the orchestrator is unavailable. */
  anthropicApiKey?: string;
  anthropicTutorModel: string;
  // P9 analytics question routing (intent only): a small, priced model.
  anthropicIntentModel: string;
  anthropicVisualModel: string;
  anthropicVoiceModel: string;
  anthropicTutorEffort: 'low' | 'medium' | 'high';
  aiEngineUrl?: string;
  aiEngineTimeoutMs: number;
  ingestHmacSecret: string;
  ingestHmacToleranceSeconds: number;
  ingestAcceptLegacySignatures: boolean;
  awsRegion: string;
  awsS3Bucket?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  // Proactive emails (reminders, weekly class summary) via Resend. Nothing is
  // sent unless enabled; a test recipient redirects every email to one inbox.
  email: {
    resendApiKey?: string;
    from?: string;
    enabled: boolean;
    testRecipient?: string;
  };
  appUrl: string;
  cronSecret?: string;
  // Emergency global stop for non-grading AI (P0d). The database switch
  // (ai_controls) is the normal way; this needs no database.
  aiPaused: boolean;
  // P1: self-registration off; accounts come from invitations.
  registrationInviteOnly: boolean;
  stagingMode: boolean;
  // Staging single-service mode ($0 Railway plan): serve the built SPA from
  // this directory, and close the idle Mongo connection so the service can
  // sleep. Both are honoured only with ENARA_STAGING=true.
  frontendDir?: string;
  dbIdleDisconnectMs?: number;
  // Cumulative cap on all AI spend while testing a deployment (P14.2), grading
  // included. Separate from school budgets; see aiBudget.ts.
  aiTestSpend?: { id: string; capUsd: number };
  elevenlabs?: {
    apiKey: string;
    voiceIdEn: string;
    voiceIdAr: string;
    // Used when the tutor's chosen face is a woman; the others are a man's voice.
    femaleVoiceId: string;
    ttsModel: string;
    sttModel: string;
    examSttModel: string;
  };
  anam?: { apiKey: string; avatarId: string; voiceIdEn: string; voiceIdAr: string };
  r2?: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string };
}

let cachedConfig: AppConfig | undefined;

function readString(
  source: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(
  source: NodeJS.ProcessEnv,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = readString(source, key);
  if (value === undefined) return defaultValue;
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  throw new Error(`${key} must be a boolean`);
}

function readNumber(
  source: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {},
): number {
  const raw = readString(source, key);
  const value = raw === undefined ? defaultValue : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${key} must be >= ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${key} must be <= ${options.max}`);
  }
  return value;
}

function requireString(source: NodeJS.ProcessEnv, key: string): string {
  const value = readString(source, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parseNodeEnv(source: NodeJS.ProcessEnv): NodeEnv {
  const value = readString(source, "NODE_ENV") || "development";
  if (!["development", "test", "production"].includes(value)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  return value as NodeEnv;
}

function parseOrigins(source: NodeJS.ProcessEnv, nodeEnv: NodeEnv): string[] {
  const explicit = readString(source, "CORS_ALLOWED_ORIGINS");
  const legacy = readString(source, "FRONTEND_URL");
  const raw = explicit || legacy;

  if (!raw && nodeEnv === "production") {
    throw new Error("CORS_ALLOWED_ORIGINS is required in production");
  }

  const fallback =
    nodeEnv === "production"
      ? []
      : [
          "https://enara.app",
          "http://localhost:5173",
          "http://localhost:3000",
          "http://127.0.0.1:5173",
        ];

  const origins = (raw ? raw.split(",") : fallback)
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    throw new Error('CORS_ALLOWED_ORIGINS must not contain wildcard "*"');
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error();
      }
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }

  return origins;
}

function assertProductionSecret(name: string, value: string): void {
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters in production`);
  }
  const forbidden = new Set(["dev-secret", "secret", "changeme", "password"]);
  if (forbidden.has(value.toLowerCase())) {
    throw new Error(`${name} uses an insecure placeholder value`);
  }
}

function parseTrustProxy(source: NodeJS.ProcessEnv): boolean | number {
  const raw = readString(source, "TRUST_PROXY");
  if (!raw) return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (/^(true|1|yes)$/i.test(raw)) return true;
  if (/^(false|0|no)$/i.test(raw)) return false;
  throw new Error("TRUST_PROXY must be true, false, or a hop count");
}

function parseTestSpend(source: NodeJS.ProcessEnv): AppConfig["aiTestSpend"] {
  const rawCap = readString(source, "AI_TEST_SPEND_CAP_USD");
  const id = readString(source, "AI_TEST_SPEND_ID");
  if (rawCap === undefined) {
    if (id) throw new Error("AI_TEST_SPEND_ID needs AI_TEST_SPEND_CAP_USD");
    return undefined;
  }
  const capUsd = Number(rawCap);
  if (!Number.isFinite(capUsd) || capUsd <= 0) {
    throw new Error("AI_TEST_SPEND_CAP_USD must be a positive number of US dollars");
  }
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error("AI_TEST_SPEND_ID (letters, digits, _ or -) is required with AI_TEST_SPEND_CAP_USD");
  }
  return { id, capUsd };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // A misspelt ENARA_STAGING would silently skip the guard: refuse it.
  const flagProblem = stagingFlagProblem(source);
  if (flagProblem) throw new Error(flagProblem);
  // Staging (ENARA_STAGING=true): refuse to start unless isolated; see stagingGuard.ts.
  const staging = isStagingMode(source);
  if (staging) assertStagingIsolation(source, source === process.env ? dotenvKeys : []);
  const nodeEnv = parseNodeEnv(source);
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";

  const jwtSecret = requireString(source, "JWT_SECRET");
  const ingestHmacSecret = requireString(source, "INGEST_HMAC_SECRET");
  if (isProduction) {
    assertProductionSecret("JWT_SECRET", jwtSecret);
    assertProductionSecret("INGEST_HMAC_SECRET", ingestHmacSecret);
  }

  const mongoUri = requireString(source, "MONGODB_URI");
  const databaseUrl = readString(source, "DATABASE_URL");
  if (isProduction && !databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }

  const enaraApiKey = readString(source, "ENARA_API_KEY");
  const enaraOrchestratorUrl = readString(source, "ENARA_ORCHESTRATOR_URL");
  if (isProduction && (!enaraApiKey || !enaraOrchestratorUrl)) {
    throw new Error(
      "ENARA_ORCHESTRATOR_URL and ENARA_API_KEY are required in production",
    );
  }

  const aiEngineUrl = readString(source, "AI_ENGINE_URL");
  if (isProduction && !aiEngineUrl) {
    throw new Error("AI_ENGINE_URL is required in production");
  }

  // Cloudflare R2 for chapter uploads: all four values or none.
  const r2Values = {
    accountId: readString(source, "R2_ACCOUNT_ID"),
    bucket: readString(source, "R2_BUCKET"),
    accessKeyId: readString(source, "R2_ACCESS_KEY_ID"),
    secretAccessKey: readString(source, "R2_SECRET_ACCESS_KEY"),
  };
  const r2Set = Object.values(r2Values).filter(Boolean).length;
  if (r2Set > 0 && r2Set < 4) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set together",
    );
  }
  const r2 = r2Set === 4 ? (r2Values as { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }) : undefined;

  // Live video avatar (Anam). Answers come from this backend, not Anam's LLM.
  const anamValues = {
    apiKey: readString(source, "ANAM_API_KEY"),
    avatarId: readString(source, "ANAM_AVATAR_ID"),
    voiceIdEn: readString(source, "ANAM_VOICE_ID_EN"),
    voiceIdAr: readString(source, "ANAM_VOICE_ID_AR"),
  };
  const anam = Object.values(anamValues).every(Boolean)
    ? (anamValues as { apiKey: string; avatarId: string; voiceIdEn: string; voiceIdAr: string })
    : undefined;

  // ElevenLabs voice for the live avatar: real-time transcription in the browser
  // and the tutor's speech, with Anam only rendering the face.
  const elevenlabsApiKey = readString(source, "ELEVENLABS_API_KEY");
  const elevenlabs = elevenlabsApiKey
    ? {
        apiKey: elevenlabsApiKey,
        // Premade multilingual voice; set Egyptian Arabic / English voices per language here.
        voiceIdEn: readString(source, "ELEVENLABS_VOICE_ID_EN") || "JBFqnCBsd6RMkjVDRZzb",
        voiceIdAr: readString(source, "ELEVENLABS_VOICE_ID_AR") || "JBFqnCBsd6RMkjVDRZzb",
        femaleVoiceId: readString(source, "ELEVENLABS_FEMALE_VOICE_ID") || "EXAVITQu4vr4xnSDxMaL",
        ttsModel: readString(source, "ELEVENLABS_TTS_MODEL") || "eleven_flash_v2_5",
        sttModel: readString(source, "ELEVENLABS_STT_MODEL") || "scribe_v2_realtime",
        // Speaking exams (P4) transcribe each recorded reply on the server (batch STT).
        examSttModel: readString(source, "ELEVENLABS_EXAM_STT_MODEL") || "scribe_v2",
      }
    : undefined;

  const email = {
    resendApiKey: readString(source, "RESEND_API_KEY"),
    from: readString(source, "REMINDER_FROM"),
    enabled: readString(source, "REMINDERS_ENABLED") === "true",
    testRecipient: readString(source, "REMINDER_TEST_RECIPIENT"),
  };

  const awsS3Bucket = readString(source, "AWS_S3_BUCKET");
  if (isProduction && !awsS3Bucket) {
    throw new Error("AWS_S3_BUCKET is required in production");
  }

  const awsAccessKeyId = readString(source, "AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = readString(source, "AWS_SECRET_ACCESS_KEY");
  if (
    (awsAccessKeyId && !awsSecretAccessKey) ||
    (!awsAccessKeyId && awsSecretAccessKey)
  ) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together",
    );
  }

  const corsAllowedOrigins = parseOrigins(source, nodeEnv);

  const demoModeEnabled = readBoolean(source, "DEMO_MODE_ENABLED", false);
  if (isProduction && demoModeEnabled) {
    const confirmed = readBoolean(
      source,
      "DEMO_MODE_PRODUCTION_CONFIRM",
      false,
    );
    if (!confirmed) {
      throw new Error(
        "DEMO_MODE_ENABLED must not be true in production unless DEMO_MODE_PRODUCTION_CONFIRM=true is also explicitly set",
      );
    }
  }

  return {
    nodeEnv,
    isProduction,
    isTest,
    port: readNumber(source, "PORT", 3001, { min: 1, max: 65535 }),
    mongoUri,
    databaseUrl,
    databaseSslRejectUnauthorized: readBoolean(
      source,
      "DATABASE_SSL_REJECT_UNAUTHORIZED",
      isProduction,
    ),
    jwtSecret,
    jwtExpiresIn: readString(source, "JWT_EXPIRES_IN") || "1h",
    jwtIssuer: readString(source, "JWT_ISSUER") || "enara-backend",
    jwtAudience: readString(source, "JWT_AUDIENCE") || "enara-platform",
    bcryptRounds: readNumber(source, "BCRYPT_ROUNDS", 12, { min: 10, max: 15 }),
    frontendUrl: readString(source, "FRONTEND_URL") || corsAllowedOrigins[0],
    corsAllowedOrigins,
    trustProxy: parseTrustProxy(source),
    requestBodyLimit: readString(source, "REQUEST_BODY_LIMIT") || "1mb",
    formBodyLimit: readString(source, "FORM_BODY_LIMIT") || "100kb",
    uploadDir: readString(source, "UPLOAD_DIR") || "uploads",
    serveLocalUploads: readBoolean(
      source,
      "SERVE_LOCAL_UPLOADS",
      !isProduction,
    ),
    demoModeEnabled,
    enaraOrchestratorUrl,
    enaraApiKey,
    enaraDefaultCourseId: readString(source, "ENARA_DEFAULT_COURSE_ID") || readString(source, "DEFAULT_COURSE_ID"),
    anthropicApiKey: readString(source, "ANTHROPIC_API_KEY"),
    anthropicTutorModel: readString(source, "ANTHROPIC_TUTOR_MODEL") || "claude-opus-5-5",
    anthropicIntentModel: readString(source, "ANTHROPIC_INTENT_MODEL") || "claude-haiku-5-5",
    anthropicVisualModel: readString(source, "ANTHROPIC_VISUAL_MODEL") || "claude-haiku-5-5",
    // Spoken avatar replies need a fast first word more than depth.
    anthropicVoiceModel: readString(source, "ANTHROPIC_VOICE_MODEL") || "claude-haiku-5-5",
    anthropicTutorEffort: (["low", "medium", "high"] as const).find(
      (e) => e === readString(source, "ANTHROPIC_TUTOR_EFFORT"),
    ) || "low",
    aiEngineUrl,
    aiEngineTimeoutMs: readNumber(source, "AI_ENGINE_TIMEOUT_MS", 15_000, {
      min: 1_000,
      max: 60_000,
    }),
    ingestHmacSecret,
    ingestHmacToleranceSeconds: readNumber(
      source,
      "INGEST_HMAC_TOLERANCE_SECONDS",
      300,
      {
        min: 30,
        max: 3_600,
      },
    ),
    ingestAcceptLegacySignatures: readBoolean(
      source,
      "INGEST_ACCEPT_LEGACY_SIGNATURES",
      false,
    ),
    awsRegion: readString(source, "AWS_REGION") || "eu-central-1",
    awsS3Bucket,
    awsAccessKeyId,
    awsSecretAccessKey,
    r2,
    anam,
    elevenlabs,
    email,
    appUrl: readString(source, "APP_URL") || "https://enara-sandbox-frontend.vercel.app",
    cronSecret: readString(source, "CRON_SECRET"),
    // Staging starts with AI paused and invite-only registration unless set explicitly.
    aiPaused: readBoolean(source, "AI_PAUSED", staging),
    registrationInviteOnly: readBoolean(source, "REGISTRATION_INVITE_ONLY", staging),
    stagingMode: staging,
    frontendDir: staging ? readString(source, "SERVE_FRONTEND_DIR") || undefined : undefined,
    aiTestSpend: parseTestSpend(source),
    dbIdleDisconnectMs:
      staging && readString(source, "DB_IDLE_DISCONNECT_MS")
        ? readNumber(source, "DB_IDLE_DISCONNECT_MS", 240_000, { min: 30_000, max: 3_600_000 })
        : undefined,
  };
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}
