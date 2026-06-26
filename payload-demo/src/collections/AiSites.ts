import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

/**
 * Stores an AI-generated multi-page site. The full design lives in `spec`
 * (a SiteSpec JSON blob) and is rendered by the self-contained SiteRenderer at
 * `/s/[slug]`. `images` holds the uploaded product images linked to the spec's
 * image indexes.
 */
export const AiSites: CollectionConfig = {
  slug: 'ai-sites',
  labels: {
    singular: 'AI Site',
    plural: 'AI Sites',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'siteName',
    defaultColumns: ['siteName', 'slug', 'themeId', 'updatedAt'],
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      unique: true,
    },
    {
      name: 'themeId',
      type: 'text',
    },
    {
      name: 'images',
      type: 'array',
      admin: { description: 'Uploaded product images, ordered to match spec image indexes.' },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
    {
      name: 'spec',
      type: 'json',
      required: true,
      admin: { description: 'The full AI-generated SiteSpec (pages, sections, theme).' },
    },
  ],
}
