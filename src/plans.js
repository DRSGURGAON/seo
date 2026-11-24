// Client packages: how many daily posts a business gets per month. The Businesses tab's `plan` column holds the package
// (its price); an empty plan means one post every day. Offer posts (type = offer) are the business's own offers and
// come on top of these, whatever the plan.
export const PLANS = {
  3500: { posts_per_month: 20 },
  5000: { posts_per_month: 30 },
};

// Posts per month for a business, or null for "every day".
export function postsPerMonth(biz) {
  const key = String(biz.plan || '').replace(/[^\d]/g, '');
  if (!key) return null;
  const plan = PLANS[key];
  if (!plan) throw new Error(`${biz.id}: unknown plan "${biz.plan}" in the Businesses tab. Known plans: ${Object.keys(PLANS).join(', ')}`);
  return plan.posts_per_month;
}
