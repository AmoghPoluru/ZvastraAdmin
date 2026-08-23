/**
 * WhatsApp Channels (newsletter) listing and posting on top of Baileys.
 *
 * Same caveats as `session-manager.ts`: unofficial WhatsApp Web session, ToS /
 * ban risk, phone must stay linked, and it needs a persistent Node process
 * (never Vercel serverless). Deliberately independent of the official Cloud API
 * helper in `src/lib/whatsapp.ts`.
 */
import { requireConnectedSession } from "./session-manager";

export type WhatsAppChannel = {
  jid: string;
  name: string;
  subscribers: number | null;
};

export type PostToChannelInput = {
  text?: string;
  mediaUrl?: string;
  caption?: string;
};

export type PostToChannelResult = {
  messageId: string | null;
};

/** Minimum gap between two posts by the same vendor. */
const DEFAULT_THROTTLE_SECONDS = 30;

/** vendorId -> epoch ms of the last accepted post. Process-local. */
const lastPostAt = new Map<string, number>();

function throttleWindowMs(): number {
  const raw = Number(process.env.WHATSAPP_CHANNELS_POST_THROTTLE_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_THROTTLE_SECONDS;
  return seconds * 1000;
}

export function isNewsletterJid(jid: string): boolean {
  return /^[0-9]+@newsletter$/.test(jid.trim());
}

export function isGroupJid(jid: string): boolean {
  return /^[0-9]+@g\.us$/i.test(jid.trim());
}

/** Channel (`@newsletter`) or group (`@g.us`) destinations we can post to. */
export function isPostableJid(jid: string): boolean {
  return isNewsletterJid(jid) || isGroupJid(jid);
}

export function assertNewsletterJid(jid: string): string {
  const trimmed = jid.trim();
  if (!isNewsletterJid(trimmed)) {
    throw new Error(
      "Invalid channel id. WhatsApp Channel JIDs look like 123456789@newsletter."
    );
  }
  return trimmed;
}

export function assertPostableJid(jid: string): string {
  const trimmed = jid.trim();
  if (!isPostableJid(trimmed)) {
    throw new Error(
      "Invalid destination id. Use a WhatsApp Channel (…@newsletter) or group (…@g.us) JID.",
    );
  }
  return trimmed;
}

/** Throws when the vendor posted too recently; records the post otherwise. */
export function assertNotThrottled(vendorId: string, now: number = Date.now()): void {
  const windowMs = throttleWindowMs();
  const previous = lastPostAt.get(vendorId);
  if (previous !== undefined && now - previous < windowMs) {
    const waitSeconds = Math.ceil((windowMs - (now - previous)) / 1000);
    throw new Error(
      `Too many channel posts. Wait ${waitSeconds}s before posting again.`
    );
  }
  lastPostAt.set(vendorId, now);
}

/** Test helper: drops the throttle bookkeeping. */
export function resetPostThrottle(): void {
  lastPostAt.clear();
}

/**
 * Baileys builds differ in which newsletter helpers they expose, so the pieces
 * used here are declared structurally instead of relying on the socket type.
 */
type NewsletterCapableSocket = {
  newsletterFetchAll?: () => Promise<
    Array<{ id: string; name?: string | null; subscribers?: number | null }>
  >;
  newsletterMetadata?: (
    type: "invite" | "jid",
    key: string
  ) => Promise<{
    id: string;
    name?: string | null;
    subscribers?: number | null;
  } | null>;
  sendMessage: (
    jid: string,
    content: Record<string, unknown>
  ) => Promise<{ key?: { id?: string | null } } | undefined>;
};

async function socketFor(vendorId: string): Promise<NewsletterCapableSocket> {
  return (await requireConnectedSession(vendorId)) as unknown as NewsletterCapableSocket;
}

/** Channels (newsletters) the linked phone can post to. */
export async function listChannels(vendorId: string): Promise<WhatsAppChannel[]> {
  const sock = await socketFor(vendorId);

  if (typeof sock.newsletterFetchAll !== "function") {
    throw new Error(
      "This Baileys build does not expose newsletterFetchAll(); paste the channel JID manually instead."
    );
  }

  const newsletters = (await sock.newsletterFetchAll()) ?? [];
  return newsletters.map((newsletter) => ({
    jid: newsletter.id,
    name: newsletter.name ?? newsletter.id,
    subscribers: newsletter.subscribers ?? null,
  }));
}

/**
 * Pulls the invite code out of a channel share link (or accepts a bare code).
 * A link like https://whatsapp.com/channel/0029Vb... carries the invite code,
 * not the JID, and the public channel page does not expose the JID either.
 */
export function parseChannelInvite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const linkMatch = trimmed.match(
    /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)/i
  );
  const code = linkMatch ? linkMatch[1] : trimmed;

  return /^[A-Za-z0-9_-]{10,64}$/.test(code) ? code : null;
}

/** Resolves a channel invite link / code to its `<digits>@newsletter` JID. */
export async function resolveChannelInvite(
  vendorId: string,
  inviteOrLink: string
): Promise<WhatsAppChannel> {
  const code = parseChannelInvite(inviteOrLink);
  if (!code) {
    throw new Error(
      "Paste a WhatsApp Channel link like https://whatsapp.com/channel/0029Vb... or its invite code."
    );
  }

  const sock = await socketFor(vendorId);
  if (typeof sock.newsletterMetadata !== "function") {
    throw new Error(
      "This Baileys build does not expose newsletterMetadata(); paste the channel JID manually instead."
    );
  }

  const metadata = await sock.newsletterMetadata("invite", code);
  if (!metadata?.id) {
    throw new Error(
      "WhatsApp did not return a channel for that link. Check the link and that the linked account can see the channel."
    );
  }

  return {
    jid: assertNewsletterJid(metadata.id),
    name: metadata.name ?? metadata.id,
    subscribers: metadata.subscribers ?? null,
  };
}

/** Posts text, or an image with a caption, to a WhatsApp Channel or group. */
export async function postToChannel(
  vendorId: string,
  channelJid: string,
  { text, mediaUrl, caption }: PostToChannelInput
): Promise<PostToChannelResult> {
  const jid = assertPostableJid(channelJid);
  const body = caption?.trim() || text?.trim();

  if (!mediaUrl && !body) {
    throw new Error("Add a caption or an image to post.");
  }

  assertNotThrottled(vendorId);

  const sock = await socketFor(vendorId);
  const content = mediaUrl
    ? { image: { url: mediaUrl }, caption: body }
    : { text: body as string };

  const sent = await sock.sendMessage(jid, content);
  return { messageId: sent?.key?.id ?? null };
}
