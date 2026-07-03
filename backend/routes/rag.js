import { Router } from 'express';
import { requireApiKey } from '../utils/authMiddleware.js';
import { fetchWithTimeout } from './context.js';

const router = Router();

router.post('/api/rag/query', requireApiKey, async (req, res) => {
  const { question, repoUrl } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'question is required.' });
  }

  const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

  try {
    const baseUrl = aiEngineUrl.replace(/\/+$/, '');
    const aiResponse = await fetchWithTimeout(`${baseUrl}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
      body: JSON.stringify({ question, repo_url: repoUrl })
    }, 30000);

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    } else {
      const errText = await aiResponse.text();
      throw new Error(errText || 'AI engine RAG query failed');
    }
  } catch (err) {
    console.error('❌ RAG Query API Error:', err.message);
    return res.status(502).json({ error: 'RAG query failed: AI Engine unavailable.' });
  }
});

export default router;
