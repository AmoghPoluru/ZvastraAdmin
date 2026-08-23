/**
 * Resolve WhatsApp group invite links (`chat.whatsapp.com/…`) to `@g.us` JIDs
 * via the vendor's linked Baileys session.
 */
import { requireConnectedSession } from "./session-manager";

export function isGroupJid(value: string): boolean {
  return /^[0-9]+@g\.us$/i.test(value.trim());
}

export function assertGroupJid(value: string): string {
  const trimmed = value.trim();
  if (!isGroupJid(trimmed)) {
    throw new Error(
      "Invalid WhatsApp group JID. Expected something like 120363…@g.us.",
    );
  }
  return trimmed;
}

/**
 * Pulls the invite code from a group invite link, or accepts a bare code.
 * Supports:
 * - https://chat.whatsapp.com/AbCdEfGhIjKlMn
 * - https://chat.whatsapp.com/invite/AbCdEfGhIjKlMn
 * - chat.whatsapp.com/AbCdEfGhIjKlMn?mode=wwt
 * - bare invite codes
 */
export function parseGroupInvite(input: string): string | null {
  let trimmed = input.trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;
  if (isGroupJid(trimmed)) return null;

  // Channel share links are not group invites.
  if (/whatsapp\.com\/channel\//i.test(trimmed)) {
    return null;
  }

  // Strip tracking / query / hash so the code is clean.
  trimmed = trimmed.split("#")[0]?.split("?")[0]?.trim() ?? trimmed;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.includes("whatsapp.com")
        ? `https://${trimmed.replace(/^\/\//, "")}`
        : null;

    if (withProtocol) {
      const url = new URL(withProtocol);
      const parts = url.pathname.split("/").filter(Boolean);
      // …/CODE or …/invite/CODE
      const code = parts[parts.length - 1] ?? "";
      if (/^[A-Za-z0-9_-]{8,64}$/.test(code) && code.toLowerCase() !== "invite") {
        return code;
      }
    }
  } catch {
    // Fall through to regex / bare-code checks.
  }

  const linkMatch = trimmed.match(
    /(?:chat\.)?whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{8,64})/i,
  );
  if (linkMatch?.[1]) return linkMatch[1];

  if (/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) return trimmed;

  return null;
}

type GroupInviteSocket = {
  groupGetInviteInfo?: (code: string) => Promise<{ id?: string | null } | null>;
};

/**
 * Resolves a group invite link / code (or a pasted `@g.us` JID) to a group JID.
 * Requires the vendor's Baileys WhatsApp session to be linked when resolving
 * an invite code.
 */
export async function resolveGroupInvite(
  vendorId: string,
  inviteOrLinkOrJid: string,
): Promise<{ jid: string }> {
  const trimmed = inviteOrLinkOrJid.trim();
  if (!trimmed) {
    throw new Error("Paste a WhatsApp group invite link first.");
  }

  if (isGroupJid(trimmed)) {
    return { jid: assertGroupJid(trimmed) };
  }

  if (/whatsapp\.com\/channel\//i.test(trimmed)) {
    throw new Error(
      "That looks like a WhatsApp Channel link. Paste a group invite link (https://chat.whatsapp.com/…).",
    );
  }

  const code = parseGroupInvite(trimmed);
  if (!code) {
    throw new Error(
      `Could not read a group invite code from "${trimmed.slice(0, 80)}". Use a link like https://chat.whatsapp.com/AbCdEfGhIjKlMn`,
    );
  }

  const sock = (await requireConnectedSession(
    vendorId,
  )) as unknown as GroupInviteSocket;

  if (typeof sock.groupGetInviteInfo !== "function") {
    throw new Error(
      "This WhatsApp session cannot look up group invites. Link WhatsApp under Post to social media first.",
    );
  }

  const info = await sock.groupGetInviteInfo(code);
  if (!info?.id) {
    throw new Error(
      "WhatsApp did not return a group for that invite link. Check the link and that your linked WhatsApp account can see the group.",
    );
  }

  return { jid: assertGroupJid(info.id) };
}

/**
 * Best-effort resolve used when saving marketing profile.
 * Returns null when the link is empty; returns existing JID when resolve fails
 * but the invite link did not change; throws when a new invite cannot be resolved.
 */
export async function resolveGroupJidForSave(args: {
  vendorId: string;
  groupLink: string | null | undefined;
  existingLink: string | null | undefined;
  existingJid: string | null | undefined;
}): Promise<string | null> {
  const link = (args.groupLink ?? "").trim();
  if (!link) return null;

  if (isGroupJid(link)) {
    return assertGroupJid(link);
  }

  const existingLink = (args.existingLink ?? "").trim();
  const existingJid = (args.existingJid ?? "").trim();

  // Same link already resolved — keep stored JID.
  if (link === existingLink && existingJid && isGroupJid(existingJid)) {
    return assertGroupJid(existingJid);
  }

  try {
    const resolved = await resolveGroupInvite(args.vendorId, link);
    return resolved.jid;
  } catch (error) {
    // Keep prior JID if the link did not change and we still have one.
    if (link === existingLink && existingJid && isGroupJid(existingJid)) {
      return assertGroupJid(existingJid);
    }
    throw error;
  }
}
