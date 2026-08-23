/**
 * Resolve Settings "WhatsApp group" invite links to a postable JID.
 *
 * Accepts:
 * - Group invites: https://chat.whatsapp.com/… → …@g.us
 * - Channel links: https://whatsapp.com/channel/… → …@newsletter
 * - Pasted JIDs: …@g.us or …@newsletter
 *
 * Requires a linked Baileys WhatsApp session.
 */
import { resolveChannelInvite, isNewsletterJid } from "./channels";
import {
  isGroupJid,
  parseGroupInvite,
  resolveGroupInvite,
  assertGroupJid,
} from "./groups";

export type WhatsAppDestinationKind = "group" | "channel" | "jid";

export function detectWhatsAppInviteKind(
  input: string,
): WhatsAppDestinationKind | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isGroupJid(trimmed) || isNewsletterJid(trimmed)) return "jid";
  if (/whatsapp\.com\/channel\//i.test(trimmed) || /wa\.me\/channel\//i.test(trimmed)) {
    return "channel";
  }
  if (
    /chat\.whatsapp\.com\//i.test(trimmed) ||
    parseGroupInvite(trimmed)
  ) {
    return "group";
  }
  return null;
}

export function isPostableWhatsAppJid(value: string): boolean {
  return isGroupJid(value) || isNewsletterJid(value);
}

/**
 * Resolves a Settings invite (group or channel) or pasted JID to a postable JID.
 */
export async function resolveWhatsAppDestination(
  vendorId: string,
  inviteOrLinkOrJid: string,
): Promise<{ jid: string; kind: WhatsAppDestinationKind }> {
  const trimmed = inviteOrLinkOrJid.trim();
  if (!trimmed) {
    throw new Error("Paste a WhatsApp group or channel invite link first.");
  }

  if (isGroupJid(trimmed)) {
    return { jid: assertGroupJid(trimmed), kind: "group" };
  }
  if (isNewsletterJid(trimmed)) {
    return { jid: trimmed.trim(), kind: "channel" };
  }

  const kind = detectWhatsAppInviteKind(trimmed);
  if (kind === "channel") {
    const channel = await resolveChannelInvite(vendorId, trimmed);
    return { jid: channel.jid, kind: "channel" };
  }

  if (kind === "group") {
    const group = await resolveGroupInvite(vendorId, trimmed);
    return { jid: group.jid, kind: "group" };
  }

  throw new Error(
    `Could not read a WhatsApp invite from "${trimmed.slice(0, 80)}". Use https://chat.whatsapp.com/… (group) or https://whatsapp.com/channel/… (channel).`,
  );
}

/** Used when saving marketing profile / syncing Settings JID. */
export async function resolveWhatsAppJidForSave(args: {
  vendorId: string;
  groupLink: string | null | undefined;
  existingLink: string | null | undefined;
  existingJid: string | null | undefined;
}): Promise<string | null> {
  const link = (args.groupLink ?? "").trim();
  if (!link) return null;

  if (isPostableWhatsAppJid(link)) {
    return link;
  }

  const existingLink = (args.existingLink ?? "").trim();
  const existingJid = (args.existingJid ?? "").trim();

  if (
    link === existingLink &&
    existingJid &&
    isPostableWhatsAppJid(existingJid)
  ) {
    return existingJid;
  }

  try {
    const resolved = await resolveWhatsAppDestination(args.vendorId, link);
    return resolved.jid;
  } catch (error) {
    if (
      link === existingLink &&
      existingJid &&
      isPostableWhatsAppJid(existingJid)
    ) {
      return existingJid;
    }
    throw error;
  }
}
