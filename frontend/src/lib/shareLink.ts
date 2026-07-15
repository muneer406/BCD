/**
 * Client-side utilities for generating and validating one-time share links.
 *
 * Tokens are SHA-256 hashes of sessionId + userId + timestamp and are stored
 * in localStorage with an expiry. They are single-use: validating a token
 * removes it from storage.
 */

const SHARE_LINKS_KEY = "share_links";
const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type ShareLinkEntry = {
  token: string;
  sessionId: string;
  expiresAt: number;
};

function getShareLinks(): ShareLinkEntry[] {
  try {
    const raw = localStorage.getItem(SHARE_LINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ShareLinkEntry[];
  } catch {
    // ignore corrupt storage
  }
  return [];
}

function setShareLinks(links: ShareLinkEntry[]): void {
  localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(links));
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a one-time token and store it with the sessionId + 7-day expiry.
 * Returns the full public share URL.
 */
export async function generateShareLink(
  sessionId: string,
  userId: string,
): Promise<string> {
  const timestamp = Date.now();
  const token = await sha256Hex(`${sessionId}:${userId}:${timestamp}`);
  const entry: ShareLinkEntry = {
    token,
    sessionId,
    expiresAt: timestamp + SHARE_LINK_TTL_MS,
  };

  const links = getShareLinks().filter(
    (link) => link.sessionId !== sessionId && link.expiresAt > Date.now(),
  );
  links.push(entry);
  setShareLinks(links);

  return `${window.location.origin}/share/${sessionId}?token=${token}`;
}

export type ShareValidationResult =
  | { valid: true; sessionId: string; token: string }
  | { valid: false; reason: "missing" | "expired" | "used" };

/**
 * Validate a token for a given session. If valid, remove it from storage
 * immediately so it cannot be reused.
 */
export function validateAndConsumeShareToken(
  sessionId: string,
  token: string | null,
): ShareValidationResult {
  if (!token) {
    return { valid: false, reason: "missing" };
  }

  const links = getShareLinks();
  const index = links.findIndex(
    (link) => link.token === token && link.sessionId === sessionId,
  );

  if (index === -1) {
    return { valid: false, reason: "used" };
  }

  const entry = links[index];
  if (entry.expiresAt <= Date.now()) {
    // Clean up expired entry
    const withoutExpired = links.filter(
      (link) => link.token !== token || link.sessionId !== sessionId,
    );
    setShareLinks(withoutExpired);
    return { valid: false, reason: "expired" };
  }

  const withoutConsumed = links.filter(
    (link) => link.token !== token || link.sessionId !== sessionId,
  );
  setShareLinks(withoutConsumed);

  return { valid: true, sessionId: entry.sessionId, token: entry.token };
}
