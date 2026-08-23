import type { CollectionConfig } from 'payload'
import { isSuperAdmin } from '@/lib/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true, // Public read access
    create: ({ req }) => {
      // Authenticated users can upload media
      return Boolean(req.user);
    },
    update: ({ req }) => {
      // Super admins can update all media
      if (isSuperAdmin(req.user)) return true;
      // Authenticated users can update their own uploads (if we track ownership)
      return Boolean(req.user);
    },
    delete: ({ req }) => {
      // Only super admins can delete media
      // This prevents accidental deletion of media used by products
      return isSuperAdmin(req.user) || false;
    },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
