import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../_utils/cors.js';
import { requireAdmin } from '../_utils/auth.js';
import { HttpError, handleApiError } from '../_utils/http.js';
import { rateLimit } from '../_utils/rateLimit.js';
import { httpsUrl, str } from '../_utils/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req);
    await rateLimit(req, { bucket: 'ai-description', limit: 20, windowMs: 60 * 60_000, key: admin.userId });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = str(body.title, { min: 1, max: 200 });
    const category = str(body.category, { min: 1, max: 100 });
    const imageUrl = body.imageUrl === undefined || body.imageUrl === '' ? undefined : httpsUrl(body.imageUrl, { max: 2000 });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('[api/admin/generate-description] GROQ_API_KEY is not set');
      throw new HttpError(503, 'AI service is unavailable');
    }

    const imageContext = imageUrl
      ? `\nAn event image is available at: ${imageUrl} — use it as visual context for the description.`
      : '';

    const userPrompt = `Generate a professional event description for the following event:

Event Title: ${title}
Category: ${category}${imageContext}

Requirements:
- 120–150 words
- Engaging and modern marketing tone
- Audience-focused and action-oriented
- SEO-friendly language
- Plain text only — no markdown, no bullet points
- Do NOT open with the event title as the first sentence
- End with a subtle call-to-action encouraging attendance

Write the description now:`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let groqRes: Response;
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a professional event copywriter. Write concise, engaging, and SEO-friendly event descriptions.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.8,
          max_tokens: 350,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!groqRes.ok) {
      console.error('[api/admin/generate-description] upstream status', groqRes.status);
      throw new HttpError(502, 'Could not generate a description right now');
    }

    const data = await groqRes.json() as any;
    const description = data?.choices?.[0]?.message?.content?.trim();

    if (!description) {
      throw new HttpError(502, 'Could not generate a description right now');
    }

    return res.status(200).json({ description });
  } catch (err) {
    return handleApiError(res, err, '[api/admin/generate-description]');
  }
}
