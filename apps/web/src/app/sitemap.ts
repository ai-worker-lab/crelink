import type { MetadataRoute } from 'next';
import { SITE_URL, SITEMAP_PATHS } from '../lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: new URL(path, SITE_URL).toString() }));
}
