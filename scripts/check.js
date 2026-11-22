// Usage: node scripts/check.js amex   -> validates out/<id>/posts.json against businesses/<id>.json rules
import { readFileSync } from 'node:fs';
import { checkPosts } from '../src/check.js';
const id = process.argv[2] || 'amex';
const biz = JSON.parse(readFileSync(`businesses/${id}.json`, 'utf8'));
const { posts } = JSON.parse(readFileSync(`out/${id}/posts.json`, 'utf8'));
const problems = checkPosts(biz, posts);
problems.forEach(p => console.log(p));
console.log(`${posts.length} posts, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
