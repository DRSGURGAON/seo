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
