// Word-shingle Jaccard similarity (0..1). Used to block near-duplicate posts.
const shingles = (t, n = 4) => {
  const w = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '));
  return s;
};
export const similarity = (a, b) => {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};
export const findDuplicates = (texts, max = 0.5) => {
  const bad = [];
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const s = similarity(texts[i], texts[j]);
      if (s > max) bad.push({ i, j, s: +s.toFixed(2) });
    }
  return bad;
};
