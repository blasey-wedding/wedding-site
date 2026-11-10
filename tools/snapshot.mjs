/**
 * Freeze the current site as a static, self-contained copy at /archive/<name>/.
 *
 *   npm run snapshot fall-save-the-date
 *
 * The copy is plain built HTML/CSS/JS, so later code changes (new colors, RSVP
 * pages, refactors) can never alter it. Snapshots are hidden: not linked from
 * the site, marked noindex, and blocked in robots.txt. They're listed at /archive/.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const name = process.argv[2];
const force = process.argv.includes('--force');

if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error('Usage: npm run snapshot <name>   (lowercase letters, numbers and dashes, e.g. fall-save-the-date)');
  process.exit(1);
}

if (!existsSync('node_modules/astro')) {
  console.error('Dependencies are not installed in this folder. Run npm install first, then try again.');
  process.exit(1);
}

const dest = `public/archive/${name}`;
if (existsSync(dest) && !force) {
  console.error(`A snapshot called "${name}" already exists. Pick another name, or add --force to replace it.`);
  process.exit(1);
}

const tmp = '.snapshot-build';
rmSync(tmp, { recursive: true, force: true });

console.log(`Building snapshot "${name}"...`);
execSync('npx --no-install astro build', {
  stdio: 'inherit',
  env: { ...process.env, SNAPSHOT_NAME: name, SNAPSHOT_BASE: `/archive/${name}/`, SNAPSHOT_OUT: tmp },
});

// Don't nest older snapshots (or the archive index) inside the new one.
rmSync(`${tmp}/archive`, { recursive: true, force: true });
rmSync(`${tmp}/robots.txt`, { force: true });

let commit = null;
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(tmp, dest, { recursive: true });
writeFileSync(`${dest}/meta.json`, JSON.stringify({ name, created: new Date().toISOString(), commit }, null, 2));
rmSync(tmp, { recursive: true, force: true });

console.log(`\nSaved to ${dest}. Commit it, and after deploying it lives at /archive/${name}/`);
