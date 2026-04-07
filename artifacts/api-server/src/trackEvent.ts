import { db } from "@workspace/db";
import { analyticsEventsTable } from "@workspace/db/schema";

const SENSITIVE_KEYS = ["password", "token", "secret", "authToken", "creditCard", "ssn", "apiKey"];

function sanitizePayload(payload: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!payload) return null;
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export async function trackEvent(
  userId: string,
  eventName: string,
  payload?: Record<string, any> | null,
): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      userId,
      eventName,
      payload: sanitizePayload(payload),
    });
  } catch {
  }
}
