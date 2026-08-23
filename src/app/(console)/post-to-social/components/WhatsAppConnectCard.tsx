"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/trpc/client";

function readableError(message: string): string {
  if (!message.trimStart().startsWith("[")) return message;
  try {
    const issues: unknown = JSON.parse(message);
    if (!Array.isArray(issues)) return message;
    const text = issues
      .map((issue) => (issue as { message?: unknown }).message)
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ");
    return text || message;
  } catch {
    return message;
  }
}

/** Link WhatsApp, store the invite link, and resolve its JID for one vendor. */
export function WhatsAppConnectCard({ vendorId }: { vendorId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [inviteDraft, setInviteDraft] = useState<string | null>(null);
  const autoSyncedJid = useRef<string | null>(null);
  const utils = trpc.useUtils();

  const { data: marketingProfile } = trpc.marketing.getProfile.useQuery({ vendorId });

  const savedGroupLink = marketingProfile?.socialChannels.socialWhatsAppGroup?.trim() ?? "";
  const groupJid = marketingProfile?.socialChannels.socialWhatsAppGroupJid?.trim() ?? "";
  const groupLink = inviteDraft ?? savedGroupLink;
  const hasWhatsAppGroup = Boolean(savedGroupLink);
  const inviteDirty = inviteDraft !== null && inviteDraft.trim() !== savedGroupLink;

  const status = trpc.whatsappChannels.sessionStatus.useQuery(
    { vendorId },
    { refetchInterval: pollingEnabled ? 3000 : 10_000 },
  );
  const connected = Boolean(status.data?.connected);

  useEffect(() => {
    setQr(null);
    setPollingEnabled(false);
    setInviteDraft(null);
    autoSyncedJid.current = null;
  }, [vendorId]);

  useEffect(() => {
    if (status.data?.qr) setQr(status.data.qr);
    if (status.data?.connected) {
      setQr(null);
      setPollingEnabled(true);
    }
  }, [status.data?.qr, status.data?.connected]);

  const saveInvite = trpc.marketing.updateProfile.useMutation({
    onSuccess: async () => {
      setInviteDraft(null);
      autoSyncedJid.current = null;
      await utils.marketing.getProfile.invalidate({ vendorId });
      toast.success("Invite link saved");
    },
    onError: (error) => toast.error(readableError(error.message)),
  });

  const syncGroupJid = trpc.whatsappChannels.syncGroupJidFromSettings.useMutation({
    onSuccess: (data) => {
      autoSyncedJid.current = data.jid;
      void utils.marketing.getProfile.invalidate({ vendorId });
      toast.success(`WhatsApp JID ready — ${data.jid}`);
    },
    onError: (error) => {
      autoSyncedJid.current = null;
      toast.error(readableError(error.message));
    },
  });

  useEffect(() => {
    if (!connected || !hasWhatsAppGroup) return;
    if (groupJid) {
      autoSyncedJid.current = groupJid;
      return;
    }
    const resolveKey = `resolve:${savedGroupLink}`;
    if (syncGroupJid.isPending) return;
    if (autoSyncedJid.current === resolveKey) return;
    autoSyncedJid.current = resolveKey;
    syncGroupJid.mutate({ vendorId, groupLink: savedGroupLink });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, hasWhatsAppGroup, groupJid, savedGroupLink, vendorId, syncGroupJid.isPending]);

  const startSession = trpc.whatsappChannels.startSession.useMutation({
    onSuccess: (data) => {
      setQr(data.qr);
      setPollingEnabled(true);
      if (data.connected) {
        toast.success("WhatsApp is linked. Resolving JID…");
        if (hasWhatsAppGroup) {
          syncGroupJid.mutate({ vendorId, groupLink: savedGroupLink });
        }
      } else if (data.qr) {
        toast.success("Scan the QR code in WhatsApp → Linked devices.");
      } else {
        toast.error("No QR code yet. Try Link WhatsApp again.");
      }
    },
    onError: (error) => toast.error(readableError(error.message)),
  });

  const logout = trpc.whatsappChannels.logout.useMutation({
    onSuccess: () => {
      setQr(null);
      setPollingEnabled(false);
      autoSyncedJid.current = null;
      void utils.whatsappChannels.sessionStatus.invalidate({ vendorId });
      toast.success("WhatsApp disconnected");
    },
    onError: (error) => toast.error(readableError(error.message)),
  });

  const handleSaveInvite = () => {
    if (!marketingProfile) return;
    saveInvite.mutate({
      vendorId,
      socialChannels: {
        ...marketingProfile.socialChannels,
        socialWhatsAppGroup: groupLink.trim(),
        // The stored JID belongs to the previous invite; let it re-resolve.
        socialWhatsAppGroupJid: "",
      },
    });
  };

  const pendingQr = connected ? null : (status.data?.qr ?? qr);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            WhatsApp Channel (beta)
          </CardTitle>
          <CardDescription>
            {connected
              ? "Linked for this vendor. Posts go to the invite link below."
              : status.data?.hasSavedAuth
                ? "Saved device found — reconnecting…"
                : "Link the vendor’s phone once; the session is stored on this server."}
          </CardDescription>
          {!hasWhatsAppGroup ? (
            <p className="text-xs text-amber-700">
              Add a WhatsApp group or channel invite link below first.
            </p>
          ) : null}
        </div>
        {connected ? (
          <Button
            variant="outline"
            onClick={() => logout.mutate({ vendorId })}
            disabled={logout.isPending}
          >
            {logout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Disconnect
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => startSession.mutate({ vendorId })}
              disabled={startSession.isPending || !hasWhatsAppGroup}
            >
              {startSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status.data?.hasSavedAuth ? "Reconnect" : "Link WhatsApp"}
            </Button>
            {pendingQr || status.data?.hasSavedAuth ? (
              <Button
                variant="outline"
                onClick={() => startSession.mutate({ vendorId, forceRelink: true })}
                disabled={startSession.isPending || !hasWhatsAppGroup}
              >
                New QR
              </Button>
            ) : null}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
          <label className="text-xs font-medium text-foreground">
            WhatsApp group / channel invite link
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 flex-1 bg-background font-mono text-xs"
              value={groupLink}
              placeholder="https://chat.whatsapp.com/… or https://whatsapp.com/channel/…"
              onChange={(event) => setInviteDraft(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!inviteDirty || saveInvite.isPending}
              onClick={handleSaveInvite}
            >
              {saveInvite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">WhatsApp JID</label>
            <Input
              readOnly
              className="bg-background font-mono text-xs"
              value={groupJid}
              placeholder={
                connected
                  ? "Resolving from invite…"
                  : "Fills after you link WhatsApp (scan QR)"
              }
            />
          </div>

          {connected && hasWhatsAppGroup && !groupJid ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncGroupJid.isPending}
              onClick={() => syncGroupJid.mutate({ vendorId, groupLink: savedGroupLink })}
            >
              {syncGroupJid.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resolve JID
            </Button>
          ) : null}
        </div>

        {!connected && startSession.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for WhatsApp QR code…
          </div>
        ) : null}

        {pendingQr ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingQr}
              alt="WhatsApp linking QR code"
              className="h-48 w-48 rounded-md border bg-white p-2"
            />
            <p className="text-xs text-muted-foreground">
              WhatsApp → Settings → Linked devices → Link a device.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
