// One-prompt batch: plan the next free dates for a business, check a batch of new posts against
// everything already in the sheet, and build what the sheet and Localo need. Pure functions; I/O is in scripts/batch.js.
import { monthDates, dayAfter, isOffer, pickTimes, postProblems, DEFAULT_TIME_WINDOW } from './month.js';
import { similarity } from './similarity.js';
import { POST_COLUMNS } from './sheet.js';

const day = d => String(d).slice(0, 10);

// `n` dates spread evenly over `candidates` (first one always included).
export function spreadDates(candidates, n) {
  if (n >= candidates.length) return candidates.slice();
  return Array.from({ length: n }, (_, i) => candidates[Math.floor((i * candidates.length) / n)]);
}

const addDays = (iso, k) => { let d = iso; for (let i = 0; i < k; i++) d = dayAfter(d); return d; };

// Next dates to fill, starting the day after the last daily post (never before `today` + 1).
// Give either `count` (that many posts) or `month` (YYYY-MM, the rest of that month).
// `perMonth` (from the business's plan, e.g. 20) spreads the posts over the month instead of one per day;
// for a month it is also the quota, minus the daily posts that month already has.
export function planDates({ existing, count, month, today, perMonth = null }) {
  const daily = existing.filter(p => !isOffer(p)).map(p => day(p.date)).sort();
  const last = daily.at(-1);
  const tomorrow = dayAfter(today);
  const from = last && dayAfter(last) > tomorrow ? dayAfter(last) : tomorrow;
  if (month) {
    const free = monthDates(month, from);
    if (!perMonth) return free;
    const already = daily.filter(d => d.startsWith(month)).length;
    return spreadDates(free, Math.max(0, Math.min(perMonth - already, free.length)));
  }
  const step = perMonth && perMonth < 30 ? 30 / perMonth : 1;
  return Array.from({ length: count }, (_, i) => addDays(from, Math.round(i * step)));
}

// A posting time per date, using the business's own window rule (same as the month generator).
export function planTimes(biz, dates, existing) {
  const r = biz.post_rules;
  return pickTimes(dates, {
    window: r.time_window === 'fixed' ? '' : (r.time_window || DEFAULT_TIME_WINDOW), seed: biz.id, fallback: r.time,
    avoid: existing.map(p => String(p.date).slice(11, 16)).filter(t => /^\d\d:\d\d$/.test(t)),
  });
}

// Problems per new post: the month generator's rules plus no repeated title, checked against existing posts AND earlier posts of this batch.
export function checkBatch(biz, existing, posts, dates) {
  const problems = [];
  if (posts.length !== dates.length) problems.push(`batch has ${posts.length} posts but ${dates.length} dates are planned`);
  const used = new Set(existing.map(p => p.date && day(p.date)));
  const titles = new Set(existing.map(p => p.title.trim().toLowerCase()));
  posts.forEach((p, i) => {
    const others = [...existing, ...posts.slice(0, i)];
    const probs = postProblems(biz, p, others);
    if (titles.has(p.title.trim().toLowerCase())) probs.push('title already used');
    titles.add(p.title.trim().toLowerCase());
    if (dates[i] && used.has(dates[i]) && !isOffer(p)) probs.push(`date ${dates[i]} already has a post`);
    if (probs.length) problems.push(`post ${i + 1} "${p.title}": ${probs.join('; ')}`);
  });
  return problems;
}

// Highest similarity of each batch post to anything else, for the report.
export function worstSimilarity(existing, posts) {
  return posts.map((p, i) => Math.max(0, ...[...existing, ...posts.filter((_, j) => j !== i)]
    .map(o => similarity(`${p.title} ${p.text}`, `${o.title} ${o.text}`))));
}

// Rows for the <id>_posts tab. `firstRow` is the sheet row the first post lands on (for the chars formula).
export function sheetRows(biz, posts, dates, times, firstRow) {
  return posts.map((p, i) => {
    const r = firstRow + i;
    return {
      id: '', date: dates[i], time: times[i], title: p.title.trim(), text: p.text.trim(), image: p.image || '',
      cta: biz.post_rules.cta || 'call', status: 'scheduled',
      chars: `=IF(E${r}="","",LEN(D${r})+1+LEN(E${r}))`, notes: p.notes || (p.topic ? `claude: ${p.topic}` : ''),
      type: '', offer_start: '', offer_end: '', banner: '',
    };
  });
}

// Tab-separated rows (no header) to paste at column A of the first empty row. Tabs/newlines inside cells are not allowed.
export function toTsv(rows) {
  return rows.map(r => POST_COLUMNS.map(c => String(r[c] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
}

// Text for Localo's post box: title, line break, text (what the sheet's chars column measures).
export const localoBody = p => `${p.title.trim()}\r\n${p.text.trim()}`;
