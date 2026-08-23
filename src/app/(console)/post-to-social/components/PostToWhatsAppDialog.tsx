"use client";

import { Loader2, MessageCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { storefrontUrl } from "@/lib/storefront";
import { trpc } from "@/trpc/client";

function buildDefaultCaption(product: { id: string; name: string; price: number }) {
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(product.price);
  return `${product.name} — ${price}\n${storefrontUrl(`/products/${product.id}`)}`;
}

type PostToWhatsAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; price: number; imageUrl: string };
  vendorId: string;
};

export function PostToWhatsAppDialog({
  open,
  onOpenChange,
  product,
  vendorId,
}: PostToWhatsAppDialogProps) {
  const defaultCaption = useMemo(() => buildDefaultCaption(product), [product]);
  const [caption, setCaption] = useState(defaultCaption);

  const profile = trpc.marketing.getProfile.useQuery({ vendorId }, { enabled: open });
  const status = trpc.whatsappChannels.sessionStatus.useQuery(
    { vendorId },
    { enabled: open, refetchInterval: open ? 5000 : false },
  );

  const groupJid = profile.data?.socialChannels.socialWhatsAppGroupJid?.trim() ?? "";
  const connected = Boolean(status.data?.connected);
  const canPost = Boolean(connected && groupJid && caption.trim());

  useEffect(() => {
    if (!open) return;
    setCaption(buildDefaultCaption(product));
  }, [open, product]);

  const post = trpc.whatsappChannels.postToChannel.useMutation({
    onSuccess: () => {
      toast.success("Posted to WhatsApp");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message || "Failed to post"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <div className="space-y-1">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Post to WhatsApp
          </DialogTitle>
          <DialogDescription>
            Posts the product photo to this vendor&apos;s WhatsApp group / channel.
          </DialogDescription>
        </div>

        <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-md bg-muted">
          <Image src={product.imageUrl} alt="" fill className="object-cover" sizes="160px" />
        </div>

        {!connected || !groupJid ? (
          <p className="text-sm text-amber-700">
            {connected
              ? "Resolve a group / channel JID for this vendor in the WhatsApp card first."
              : "Link WhatsApp for this vendor in the WhatsApp card first."}
          </p>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Caption to post</label>
          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={4}
            placeholder="Caption to post"
          />
        </div>

        <Button
          disabled={post.isPending || !canPost}
          onClick={() =>
            post.mutate({
              vendorId,
              channelJid: groupJid,
              caption: caption.trim(),
              imageUrl: storefrontUrl(product.imageUrl),
              productId: product.id,
            })
          }
        >
          {post.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Post to WhatsApp
        </Button>
      </DialogContent>
    </Dialog>
  );
}
