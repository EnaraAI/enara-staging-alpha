// Schools never see which outside services ENARA uses. These helpers turn the
// internal names (kept for metering and support) into neutral ones before
// anything is sent to a school user.

const PROVIDER = /anthropic|claude|opus|sonnet|haiku|elevenlabs|eleven_|scribe|anam|openai|gpt-|gemini/i;

// A reply's engine label, e.g. 'anthropic:claude-opus-5-5' -> 'enara-ai'.
// Other labels (local fallbacks, the course engine) pass through.
export function publicVersion(version: string | undefined): string | undefined {
  if (!version) return version;
  return PROVIDER.test(version) ? 'enara-ai' : version;
}

export function namesProvider(value: string | undefined): boolean {
  return Boolean(value && PROVIDER.test(value));
}

// Rule given to every model that talks to students or staff.
export const IDENTITY_RULE =
  "You are Enara's AI. If anyone asks what model, company or technology you are built on or who made you, say you are Enara's AI assistant, built by Enara, and don't name any AI model, AI company or other provider.";
