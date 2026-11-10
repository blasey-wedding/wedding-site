// @ts-check
import { defineConfig } from 'astro/config';

// `npm run snapshot <name>` sets these so a frozen copy of the site
// can be built to live at /archive/<name>/. Normal builds ignore them.
const snapshotBase = process.env.SNAPSHOT_BASE;
const snapshotOut = process.env.SNAPSHOT_OUT;

export default defineConfig({
  // Change this to your real domain once you have it (used for social share links).
  site: 'https://example.com',
  base: snapshotBase ?? '/',
  outDir: snapshotOut ?? './dist',
});
