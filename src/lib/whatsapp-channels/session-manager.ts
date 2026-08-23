/**
 * Baileys (unofficial WhatsApp Web) session manager for WhatsApp Channels.
 *
 * IMPORTANT — read before deploying:
 * - This is an UNOFFICIAL WhatsApp Web session (multi-device link), NOT the
 *   official Cloud API. It is a separate engine from `src/lib/whatsapp.ts` and
 *   must never import from it.
 * - Using it carries WhatsApp ToS / account-ban risk, and the vendor's phone
 *   must stay linked (scan the QR from WhatsApp → Linked devices).
 * - It CANNOT run on Vercel serverless: Baileys holds a long-lived WebSocket
 *   and writes auth state to disk, both of which die with the function
 *   invocation. Run it in a persistent Node process (`npm run dev`, a VPS, a
 *   container, Railway/Render/Fly, etc.). The module-level `Map` below is the
 *   natural seam for extracting a standalone service.
 *
 * Persistence: auth lives under `WHATSAPP_CHANNELS_SESSION_DIR` (default
 * `./sessions/<vendorId>/`). After a successful QR scan, Link WhatsApp /
 * server restarts reconnect from those files — they are only wiped on
 * Disconnect or an explicit re-link.
 */
import path from "node:path";
import { access } from "node:fs/promises";
import { rm } from "node:fs/promises";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  // Aliased: it is not a React hook, and the `use*` name trips react-hooks lint.
  useMultiFileAuthState as loadMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";

export type SessionStatus = {
  connected: boolean;
  /** QR code as a `data:image/png;base64,…` URL, or null when none is pending. */
  qr: string | null;
  /** True when creds exist on disk (survives server restarts). */
  hasSavedAuth: boolean;
};

export type Session = {
  sock: WASocket;
  connected: boolean;
  qr: string | null;
  /** Resolvers waiting for the first QR / open connection. */
  waiters: Array<() => void>;
  /** Prevent infinite wipe/rebind loops if WhatsApp keeps rejecting. */
  clearedDeadAuth?: boolean;
};

type SessionsGlobal = typeof globalThis & {
  __whatsappChannelSessions?: Map<string, Session>;
};

/** Survive Next.js HMR / duplicate module instances in dev. */
function getSessions(): Map<string, Session> {
  const g = globalThis as SessionsGlobal;
  if (!g.__whatsappChannelSessions) {
    g.__whatsappChannelSessions = new Map();
  }
  return g.__whatsappChannelSessions;
}

const SESSIONS_ROOT = process.env.WHATSAPP_CHANNELS_SESSION_DIR || "./sessions";

/** Milliseconds `startSession` waits for a QR (or an already-open socket). */
const QR_WAIT_MS = 25_000;

/** Session directories are named after the vendor id, so keep it path-safe. */
function sessionDir(vendorId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(vendorId)) {
    throw new Error("Invalid vendor id for WhatsApp channel session");
  }
  return path.join(/* turbopackIgnore: true */ SESSIONS_ROOT, vendorId);
}

export async function hasSavedAuth(vendorId: string): Promise<boolean> {
  try {
    await access(path.join(sessionDir(vendorId), "creds.json"));
    return true;
  } catch {
    return false;
  }
}

async function wipeAuthFiles(vendorId: string): Promise<void> {
  await rm(sessionDir(vendorId), { recursive: true, force: true });
}

function notifyWaiters(session: Session) {
  const waiters = session.waiters.splice(0, session.waiters.length);
  for (const resolve of waiters) resolve();
}

function disconnectStatusCode(lastDisconnect: unknown): number | undefined {
  if (!lastDisconnect || typeof lastDisconnect !== "object") return undefined;
  const error = (lastDisconnect as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const output = (error as { output?: { statusCode?: number } }).output;
  return output?.statusCode;
}

async function bindSocket(vendorId: string, session: Session): Promise<void> {
  const { state, saveCreds } = await loadMultiFileAuthState(sessionDir(vendorId));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  session.sock = sock;
  session.connected = false;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      void QRCode.toDataURL(qr)
        .then((dataUrl) => {
          // Ignore stale QR events from a replaced socket.
          if (getSessions().get(vendorId)?.sock !== sock) return;
          session.qr = dataUrl;
          console.log(`[whatsapp-channels] QR ready for vendor ${vendorId}`);
          notifyWaiters(session);
        })
        .catch((error: unknown) => {
          console.error("[whatsapp-channels] failed to render QR:", error);
        });
    }

    if (connection === "open") {
      if (getSessions().get(vendorId)?.sock !== sock) return;
      session.connected = true;
      session.qr = null;
      console.log(`[whatsapp-channels] connected for vendor ${vendorId}`);
      notifyWaiters(session);
      return;
    }

    if (connection === "close") {
      if (getSessions().get(vendorId)?.sock !== sock) return;

      session.connected = false;
      const statusCode = disconnectStatusCode(lastDisconnect);
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.warn(
        `[whatsapp-channels] connection closed for vendor ${vendorId}`,
        { statusCode, loggedOut },
      );

      if (loggedOut) {
        // Dead creds on disk (401) — wipe once and re-pair so Link WhatsApp
        // can still show a fresh QR instead of failing immediately.
        if (!session.clearedDeadAuth) {
          session.clearedDeadAuth = true;
          session.qr = null;
          console.warn(
            `[whatsapp-channels] wiping dead auth for vendor ${vendorId} and re-pairing`,
          );
          void wipeAuthFiles(vendorId)
            .then(() => bindSocket(vendorId, session))
            .catch((error: unknown) => {
              console.error(
                `[whatsapp-channels] re-pair after logout failed for ${vendorId}:`,
                error,
              );
              getSessions().delete(vendorId);
              notifyWaiters(session);
            });
          return;
        }

        getSessions().delete(vendorId);
        notifyWaiters(session);
        console.warn(
          `[whatsapp-channels] vendor ${vendorId} logged out; re-pair already attempted`,
        );
        return;
      }

      // Baileys commonly closes with 515 (restart required) right after the
      // first QR / pairing handshake. Reconnect with the same auth state
      // instead of dropping the session (which made the QR "never work").
      void bindSocket(vendorId, session).catch((error: unknown) => {
        console.error(
          `[whatsapp-channels] reconnect failed for vendor ${vendorId}:`,
          error,
        );
        getSessions().delete(vendorId);
        notifyWaiters(session);
      });
    }
  });
}

async function createSession(vendorId: string): Promise<Session> {
  // Placeholder sock; replaced immediately in bindSocket.
  const session: Session = {
    sock: null as unknown as WASocket,
    connected: false,
    qr: null,
    waiters: [],
  };
  getSessions().set(vendorId, session);
  await bindSocket(vendorId, session);
  return session;
}

async function endSocket(session: Session | undefined): Promise<void> {
  if (!session?.sock) return;
  try {
    session.sock.end(undefined);
  } catch {
    // ignore
  }
}

async function waitForQrOrOpen(session: Session): Promise<void> {
  if (session.connected || session.qr) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, QR_WAIT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    session.waiters.push(done);
    if (session.connected || session.qr) done();
  });
}

/**
 * Returns the vendor's live socket, creating / reconnecting from disk auth.
 *
 * - Default: keep `./sessions/<vendorId>` creds (persistent link).
 * - `forceRelink: true`: wipe creds and show a fresh QR (explicit re-pair only).
 */
export async function getOrCreateSession(
  vendorId: string,
  opts?: { forceRelink?: boolean },
): Promise<Session> {
  const sessions = getSessions();

  if (opts?.forceRelink) {
    const previous = sessions.get(vendorId);
    sessions.delete(vendorId);
    await endSocket(previous);
    await wipeAuthFiles(vendorId);
  }

  let session = sessions.get(vendorId);
  if (!session) {
    session = await createSession(vendorId);
  }

  await waitForQrOrOpen(session);
  return session;
}

/**
 * Restore a linked device from disk after a server restart (no QR if creds ok).
 * No-op when nothing is saved. Safe to call from polled status — only creates
 * a socket once when none is in memory.
 */
export async function restoreSessionIfSaved(vendorId: string): Promise<SessionStatus> {
  if (!(await hasSavedAuth(vendorId))) {
    return { connected: false, qr: null, hasSavedAuth: false };
  }

  const existing = getSessions().get(vendorId);
  if (existing) {
    return {
      connected: existing.connected,
      qr: existing.qr,
      hasSavedAuth: true,
    };
  }

  const session = await getOrCreateSession(vendorId);
  return {
    connected: session.connected,
    qr: session.qr,
    hasSavedAuth: true,
  };
}

/** Socket for an already-linked vendor; restores from disk after restarts. */
export async function requireConnectedSession(vendorId: string): Promise<WASocket> {
  let session = getSessions().get(vendorId);

  if (!session?.connected && (await hasSavedAuth(vendorId))) {
    session = await getOrCreateSession(vendorId);
  }

  if (!session?.connected) {
    throw new Error(
      "WhatsApp channel session is not connected. Scan the QR code from WhatsApp → Linked devices first.",
    );
  }
  return session.sock;
}

export async function getSessionStatus(vendorId: string): Promise<SessionStatus> {
  const saved = await hasSavedAuth(vendorId);
  const session = getSessions().get(vendorId);
  if (!session) {
    return { connected: false, qr: null, hasSavedAuth: saved };
  }
  return {
    connected: session.connected,
    qr: session.qr,
    hasSavedAuth: saved,
  };
}

/** Logs the vendor out of WhatsApp and deletes the on-disk auth state. */
export async function logoutSession(vendorId: string): Promise<void> {
  const sessions = getSessions();
  const session = sessions.get(vendorId);
  sessions.delete(vendorId);

  if (session) {
    try {
      await session.sock.logout();
    } catch (error) {
      console.error("[whatsapp-channels] logout failed:", error);
    }
  }

  await wipeAuthFiles(vendorId);
}
