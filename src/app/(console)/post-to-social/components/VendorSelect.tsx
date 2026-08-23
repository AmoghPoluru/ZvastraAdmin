"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type VendorListOption = inferRouterOutputs<AppRouter>["catalog"]["vendorOptions"][number];

interface VendorSelectProps {
  value?: string;
  onValueChange: (vendorId: string) => void;
}

export function VendorSelect({ value, onValueChange }: VendorSelectProps) {
  const { data: vendors, isLoading, error } = trpc.catalog.vendorOptions.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-2 max-w-md">
        <Label>Vendor</Label>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load vendors: {error.message}
      </p>
    );
  }

  const options: VendorListOption[] = vendors ?? [];

  return (
    <div className="space-y-2 max-w-md">
      <Label htmlFor="vendor-select">Vendor</Label>
      <Select value={value ?? ""} onValueChange={onValueChange}>
        <SelectTrigger id="vendor-select" className="w-full">
          <SelectValue placeholder="Select a vendor" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <SelectItem value="__none" disabled>
              No vendors found
            </SelectItem>
          ) : (
            options.map((vendor) => {
              const statusSuffix =
                vendor.status && vendor.status !== "approved"
                  ? ` (${vendor.status})`
                  : "";
              return (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                  {statusSuffix}
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
