// Validates a business's posts against its post_rules. Returns a list of problem strings.
import { findDuplicates } from './similarity.js';

export function checkPosts(biz, posts) {
  const r = biz.post_rules, tol = r.length_tolerance || 0, problems = [];
  const name = i => `post ${i + 1}${posts[i].id ? ` (${posts[i].id})` : ''}`;
  const texts = posts.map(p => `${p.title} ${p.text}`);
  const pk = biz.primary_keyword.toLowerCase(), sk = biz.secondary_keyword.toLowerCase();
  texts.forEach((t, i) => {
    if (t.length < r.min_chars - tol || t.length > r.max_chars + tol) problems.push(`${name(i)}: length ${t.length} outside ${r.min_chars}-${r.max_chars}`);
    if (!t.toLowerCase().includes(pk) && !t.toLowerCase().includes(sk)) problems.push(`${name(i)}: no keyword`);
  });
  findDuplicates(texts, r.max_similarity).forEach(d => problems.push(`${name(d.i)} & ${name(d.j)}: similarity ${d.s}`));
  if (new Set(posts.map(p => p.date)).size !== posts.length) problems.push('duplicate dates');
  return problems;
}
