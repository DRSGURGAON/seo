// Build an .xlsx from the current JSON files, to upload to Google Sheets once (File > Import).
// Usage: npm run sheet:export   -> sheet/gbp-sheet.xlsx (git-ignored)
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { buildTemplate } from '../src/sheet.js';

const read = p => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const profiles = readdirSync('businesses').filter(f => f.endsWith('.json'))
  .map(f => { const biz = read(`businesses/${f}`); return { biz, feed: read(`out/${biz.id}/posts.json`), blogs: read(`out/${biz.id}/blogs.json`)?.blogs }; });

// Profiles still to be filled in: rows are added with active = no so sync skips them until ready.
const planned = [
  { id: 'drs', name: 'Defence Relocation Services', website: 'https://defencerelocationservices.in/' },
  { id: 'storagewale', name: 'StorageWale', website: '' },
];
for (const p of planned) if (!profiles.some(x => x.biz.id === p.id)) profiles.push({ biz: { ...p, active: false }, feed: null });

mkdirSync('sheet', { recursive: true });
const out = process.argv[2] || 'sheet/gbp-sheet.xlsx';
await buildTemplate(profiles).xlsx.writeFile(out);
console.log(`Wrote ${out} (${profiles.map(p => p.biz.id).join(', ')})`);
