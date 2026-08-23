"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Instagram, Loader2, MessageCircle, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { storefrontUrl } from "@/lib/storefront";
import { trpc } from "@/trpc/client";
import type { Product } from "@/payload-types";
import { PostToSocialsDialog } from "./PostToSocialsDialog";
import { PostToWhatsAppDialog } from "./PostToWhatsAppDialog";
import { VendorSelect } from "./VendorSelect";
import { WhatsAppConnectCard } from "./WhatsAppConnectCard";

type PostableProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
};

/**
 * Media stored with a relative URL is served by the storefront, not by this
 * console, so it has to be resolved against the storefront origin.
 */
function getProductImageUrl(image: unknown): string | null {
  if (typeof image === "object" && image !== null && "url" in image) {
    const url = (image as { url?: string | null }).url;
    return url ? storefrontUrl(url) : null;
  }
  return null;
}

export function PostToSocialPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [postProduct, setPostProduct] = useState<PostableProduct | null>(null);
  const [whatsAppProduct, setWhatsAppProduct] =
    useState<PostableProduct | null>(null);
  const [page, setPage] = useState(1);
  const [productsWithImages, setProductsWithImages] = useState<PostableProduct[]>(
    [],
  );
  const [disconnecting, setDisconnecting] = useState(false);

  const utils = trpc.useUtils();
  const { data: vendors } = trpc.catalog.vendorOptions.useQuery();
  const vendorName = vendors?.find(
    (v: { id: string; name: string }) => v.id === vendorId,
  )?.name;

  // Prefill vendor from OAuth return / shared links.
  useEffect(() => {
    const fromUrl = searchParams.get("vendorId")?.trim();
    if (fromUrl) setVendorId(fromUrl);

    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "instagram") {
      toast.success("Instagram connected for this vendor.");
      if (fromUrl) {
        void utils.social.instagramStatus.invalidate({ vendorId: fromUrl });
      }
      router.replace(
        fromUrl
          ? `/post-to-social?vendorId=${encodeURIComponent(fromUrl)}`
          : "/post-to-social",
      );
    } else if (error) {
      toast.error(error);
      router.replace(
        fromUrl
          ? `/post-to-social?vendorId=${encodeURIComponent(fromUrl)}`
          : "/post-to-social",
      );
    }
  }, [router, searchParams, utils.social.instagramStatus]);

  const igStatus = trpc.social.instagramStatus.useQuery(
    { vendorId: vendorId! },
    { enabled: Boolean(vendorId) },
  );
  const marketingProfile = trpc.marketing.getProfile.useQuery(
    { vendorId: vendorId! },
    { enabled: Boolean(vendorId) },
  );
  const whatsappStatus = trpc.whatsappChannels.sessionStatus.useQuery(
    { vendorId: vendorId! },
    { enabled: Boolean(vendorId), refetchInterval: 10_000 },
  );

  const disconnectInstagram = trpc.social.disconnectInstagram.useMutation({
    onSuccess: async () => {
      toast.success("Instagram disconnected");
      if (vendorId) {
        await utils.social.instagramStatus.invalidate({ vendorId });
      }
    },
    onError: (error) => toast.error(error.message || "Failed to disconnect"),
    onSettled: () => setDisconnecting(false),
  });

  const {
    data: productsData,
    isLoading: loadingProducts,
    isFetching,
  } = trpc.catalog.products.useQuery(
    {
      vendorId,
      status: "all",
      page,
      limit: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { enabled: Boolean(vendorId) },
  );

  useEffect(() => {
    setPage(1);
    setProductsWithImages([]);
    setPostProduct(null);
    setWhatsAppProduct(null);
  }, [vendorId]);

  useEffect(() => {
    if (!productsData?.docs || !vendorId) return;

    const pageProducts = (productsData.docs as Product[])
      .map((product: Product) => {
        const imageUrl = getProductImageUrl(product.image);
        if (!imageUrl) return null;
        return {
          id: product.id,
          name: product.name,
          price: product.price ?? 0,
          imageUrl,
        };
      })
      .filter((p): p is PostableProduct => p !== null);

    setProductsWithImages((prev) => {
      if (page === 1) return pageProducts;
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...pageProducts.filter((p) => !seen.has(p.id))];
    });
  }, [productsData, page, vendorId]);

  const instagram = igStatus.data?.find(
    (c) => c.platform === "instagram" && c.connected,
  );
  const whatsappReady = Boolean(
    whatsappStatus.data?.connected &&
      marketingProfile.data?.socialChannels.socialWhatsAppGroupJid?.trim(),
  );

  const connectInstagramHref = vendorId
    ? `/api/auth/instagram/connect?vendorId=${encodeURIComponent(vendorId)}`
    : "#";

  return (
    <div className="space-y-8">
      <VendorSelect
        value={vendorId}
        onValueChange={(id) => {
          setVendorId(id);
          router.replace(`/post-to-social?vendorId=${encodeURIComponent(id)}`);
        }}
      />

      {!vendorId ? (
        <p className="text-sm text-gray-500">
          Select a vendor to connect channels and post their products.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Instagram className="h-5 w-5" />
                  Instagram
                </CardTitle>
                <CardDescription>
                  {igStatus.isLoading
                    ? "Checking connection…"
                    : instagram
                      ? `Connected as @${instagram.username}`
                      : "Connect a Professional Instagram account for this vendor."}
                </CardDescription>
                {instagram?.tokenExpiresAt ? (
                  <p className="text-xs text-muted-foreground">
                    Token expires{" "}
                    {new Date(instagram.tokenExpiresAt).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
              {instagram ? (
                <Button
                  variant="outline"
                  disabled={disconnecting || disconnectInstagram.isPending}
                  onClick={() => {
                    setDisconnecting(true);
                    disconnectInstagram.mutate({ vendorId });
                  }}
                >
                  {(disconnecting || disconnectInstagram.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Disconnect
                </Button>
              ) : (
                <Button asChild>
                  <a href={connectInstagramHref}>Connect Instagram</a>
                </Button>
              )}
            </CardHeader>
          </Card>

          <WhatsAppConnectCard key={vendorId} vendorId={vendorId} />

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Products
                {vendorName ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {vendorName}
                  </span>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                Product image + caption, posted to the vendor&apos;s channels.
              </p>
            </div>

            {loadingProducts && page === 1 ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-md" />
                    <Skeleton className="h-9 w-48" />
                  </div>
                ))}
              </div>
            ) : productsWithImages.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-10">
                <p className="text-sm text-muted-foreground">
                  No product photos for this vendor yet.
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <PackagePlus className="h-4 w-4" />
                  Add product photos in the Zvastra vendor portal first.
                </p>
              </div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {productsWithImages.map((product) => (
                  <li
                    key={product.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-3 sm:gap-4"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={product.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="shrink-0"
                        disabled={!instagram}
                        onClick={() => setPostProduct(product)}
                        title={
                          instagram
                            ? undefined
                            : "Connect Instagram for this vendor first"
                        }
                      >
                        <Instagram className="h-4 w-4" />
                        Post on Instagram
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={!whatsappReady}
                        onClick={() => setWhatsAppProduct(product)}
                        title={
                          whatsappReady
                            ? undefined
                            : "Link WhatsApp and resolve JID first"
                        }
                      >
                        <MessageCircle className="h-4 w-4" />
                        Post to WhatsApp
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {productsData?.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  disabled={isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {isFetching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </section>

          {postProduct && vendorId ? (
            <PostToSocialsDialog
              open={Boolean(postProduct)}
              onOpenChange={(open) => {
                if (!open) setPostProduct(null);
              }}
              product={postProduct}
              vendorId={vendorId}
            />
          ) : null}

          {whatsAppProduct && vendorId ? (
            <PostToWhatsAppDialog
              open={Boolean(whatsAppProduct)}
              onOpenChange={(open) => {
                if (!open) setWhatsAppProduct(null);
              }}
              product={whatsAppProduct}
              vendorId={vendorId}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
