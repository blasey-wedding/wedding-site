import type { ImageMetadata } from 'astro';
import { couple, photoAlts } from '../data/wedding';

/**
 * Every image dropped into src/assets/photos is picked up automatically,
 * sorted by filename. Astro resizes, converts to AVIF/WebP and strips EXIF
 * (including GPS location) at build time.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/photos/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG}',
  { eager: true },
);

export type Photo = { file: string; src: ImageMetadata; alt: string };

export const photos: Photo[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([path, mod], i) => {
    const file = path.split('/').pop()!;
    return { file, src: mod.default, alt: photoAlts[file] ?? `Engagement photo ${i + 1} of ${couple.partnerOne} and ${couple.partnerTwo}` };
  });

export const photoByFile = (file?: string) => photos.find((p) => p.file === file);
