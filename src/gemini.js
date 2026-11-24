// Minimal Gemini client (REST, no SDK). Returns parsed JSON from a structured-output call.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini often answers 429/500/503 ("high demand") for a short while: wait and try again instead of losing the whole run.
const RETRY = new Set([429, 500, 502, 503, 504]);
export async function withRetry(call, { tries = 5, wait = ms => new Promise(r => setTimeout(r, ms)), baseMs = 5000 } = {}) {
  for (let i = 1; ; i++) {
    try { return await call(); } catch (e) {
      if (i >= tries || !RETRY.has(e.status)) throw e;
      const ms = baseMs * 2 ** (i - 1);
      console.log(`  Gemini busy (${e.status}), retrying in ${Math.round(ms / 1000)}s (${i}/${tries - 1})`);
      await wait(ms);
    }
  }
}

// Text models this key can use, newest first, flash before pro (cheaper). Only plain stable names like
// gemini-3.8-flash or gemini-2.5-pro: no preview, lite, image, tts, live or embedding variants.
export async function listTextModels(apiKey, fetchFn = fetch) {
  const res = await fetchFn(`${API}?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  const ver = n => n.match(/gemini-([\d.]+)/)[1].split('.').map(Number);
  return (body.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => /^gemini-[\d.]+-(flash|pro)(-latest)?$/.test(n))
    .sort((a, b) => {
      const [x, y] = [ver(a), ver(b)];
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
      return (a.includes('flash') ? 0 : 1) - (b.includes('flash') ? 0 : 1);
    });
}

// When the chosen model stays busy after all retries, try other models (GEMINI_FALLBACK_MODELS, comma-separated,
// or the ones this key can use). The first one that answers is kept for the rest of the run.
const switched = new Map();
export async function geminiJson(opts, { list = listTextModels, retry = {}, log = console.log } = {}) {
  const first = switched.get(opts.model) || opts.model;
  let lastErr;
  try { return await withRetry(() => geminiJsonOnce({ ...opts, model: first }), retry); } catch (e) {
    if (!RETRY.has(e.status)) throw e;
    lastErr = e;
  }
  const env = (process.env.GEMINI_FALLBACK_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const alts = (env.length ? env : await list(opts.apiKey)).filter(m => m !== first && m !== opts.model).slice(0, 3);
  for (const model of alts) {
    log(`  ${first} still busy, trying ${model}`);
    try {
      const out = await withRetry(() => geminiJsonOnce({ ...opts, model }), { ...retry, tries: 3 });
      switched.set(opts.model, model);
      log(`  using ${model} for the rest of this run`);
      return out;
    } catch (e) {
      if (!RETRY.has(e.status) && e.status !== 404) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}
export const resetModelSwitch = () => switched.clear();

async function geminiJsonOnce({ apiKey, model, prompt, schema, temperature = 0.9 }) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}: ${body.error?.message || res.statusText}`), { status: res.status });
  const text = body.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error(`Gemini returned no text (finishReason: ${body.candidates?.[0]?.finishReason || 'unknown'})`);
  return JSON.parse(text);
}

// Image generation. Returns { mimeType, data: Buffer }. Model is set by the caller (GEMINI_IMAGE_MODEL).
export async function geminiImage({ apiKey, model, prompt, aspectRatio = '4:3' }) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 404 ? ' (model not found: set the GEMINI_IMAGE_MODEL variable to a current Gemini image model)' : '';
    throw new Error(`Gemini ${res.status}: ${body.error?.message || res.statusText}${hint}`);
  }
  const part = body.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!part) throw new Error(`Gemini returned no image (finishReason: ${body.candidates?.[0]?.finishReason || 'unknown'})`);
  return { mimeType: part.inlineData.mimeType || 'image/png', data: Buffer.from(part.inlineData.data, 'base64') };
}
