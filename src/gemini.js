// Minimal Gemini client (REST, no SDK). Returns parsed JSON from a structured-output call.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function geminiJson({ apiKey, model, prompt, schema, temperature = 0.9 }) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message || res.statusText}`);
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
