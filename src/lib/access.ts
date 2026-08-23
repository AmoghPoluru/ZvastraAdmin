import type { User, Role } from "../payload-types";

/** Resolved app role string from `users.role` plus legacy fallbacks. */
export function getUserRole(user: User | undefined | null): string | undefined {
  if (!user) return undefined;

  const u = user as User & {
    role?: string;
    roles?: unknown;
    appRole?: Role | string | null;
  };

  // Legacy first so old records are not misread as `user` after adding `role` with a default.
  if (Array.isArray(u.roles) && u.roles.includes("super-admin")) {
    return "admin";
  }

  if (u.appRole) {
    const appRole = u.appRole as Role | string;
    if (typeof appRole === "object" && appRole !== null && "slug" in appRole) {
      if (appRole.slug === "app-admin") return "admin";
    }
  }

  if (typeof u.role === "string" && u.role) {
    return u.role;
  }

  return undefined;
}

/**
 * Payload CMS + full CMS access (products, orders, media, vendor approval).
 * Only `role: admin` (plus legacy super-admin / app-admin).
 */
export function isAppAdmin(user: User | undefined | null): boolean {
  return getUserRole(user) === "admin";
}

/** Platform staff — admin-only access to /staff/* routes. */
export function isAppStaff(user: User | undefined | null): boolean {
  return isAppAdmin(user);
}

/**
 * @deprecated Use `isAppAdmin` for CMS or `isAppStaff` for vendor-task routes.
 * Currently aliases `isAppAdmin` for existing collection imports.
 */
export function isSuperAdmin(user: User | undefined | null): boolean {
  return isAppAdmin(user);
}

export function hasVendor(user: User | undefined | null): boolean {
  if (!user) return false;
  return Boolean(user.vendor);
}

export function belongsToVendor(user: User | undefined | null, vendorId: string): boolean {
  if (!user || !vendorId) return false;

  const vendor = user.vendor;
  if (!vendor) return false;

  if (typeof vendor === "string") {
    return vendor === vendorId;
  }

  return vendor.id === vendorId;
}

export function getVendorId(user: User | undefined | null): string | null {
  if (!user || !user.vendor) return null;

  if (typeof user.vendor === "string") {
    return user.vendor;
  }

  return user.vendor.id || null;
}

export function isVendor(user: User | undefined | null): boolean {
  return hasVendor(user);
}

export function isVendorOwner(user: User | undefined | null, vendorId: string | null | undefined): boolean {
  if (!user || !vendorId) return false;
  return belongsToVendor(user, vendorId);
}

export function isApprovedVendor(user: User | undefined | null): boolean {
  if (!user || !user.vendor) return false;

  if (typeof user.vendor === "object" && user.vendor !== null) {
    return user.vendor.status === "approved" && user.vendor.isActive === true;
  }

  return false;
}
