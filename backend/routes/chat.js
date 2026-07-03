import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { requireApiKey } from '../utils/authMiddleware.js';
import Session from '../models/Session.js';
import {
  reviewQueue, fetchWithTimeout, ALLOWED_ANALYSIS_MODELS,
  validatePrompt, requireJsonContentType, redisClient
} from './context.js';

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many chat requests. Please slow down and retry after 1 minute.' }
});

const router = Router();

router.post('/api/chat', requireApiKey, requireJsonContentType, chatLimiter, async (req, res) => {
  let { message, history = [], model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, systemPrompt = 'You are a helpful code reviewer.', sessionId, useRag, ragSources } = req.body;

  const chatNormalized = ALLOWED_ANALYSIS_MODELS.find(m => m.toLowerCase() === model.toLowerCase());
  if (!chatNormalized) {
    model = "llama-3.3-70b-versatile";
  } else {
    model = chatNormalized;
  }

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required for chat.' });
  }

  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (sessionId) {
    try {
      const session = await Session.findOne({ sessionId });
      if (session) {
        if (session.ownerToken && session.ownerToken !== req.clientId) {
          console.warn(`⚠️ Session ownership mismatch: session ${sessionId} ownerToken=${session.ownerToken} request clientId=${req.clientId} (possible auth-method change or cookie refresh)`);
          return res.status(403).json({ error: 'Access denied: this session does not belong to you.' });
        }
        await Session.updateOne({ sessionId }, { $set: { lastAccessedAt: new Date() }, $max: { absoluteExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      }
    } catch (sessionErr) {
      console.warn('❌ Failed to retrieve session from MongoDB:', sessionErr.message);
    }
  }

  try {
    await reviewQueue.runExclusive(sessionId, async () => {
      let context = null;
      try {
        context = await Session.findOne({ sessionId });
      } catch (sessionErr) {
        console.warn('⚠️ Failed to retrieve session from MongoDB:', sessionErr.message);
      }

      if (!context) {
        res.status(400).json({ error: `No repository is currently active or session expired or not found. Please analyze a repository first.` });
        return;
      }

      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

      try {
        const baseUrl = aiEngineUrl.replace(/\/+$/, '');
        const aiResponse = await fetchWithTimeout(`${baseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
          body: JSON.stringify({
            files: context.files,
            message,
            history,
            model,
            temperature,
            maxTokens,
            systemPrompt: validatedPrompt,
            useRag,
            repo_url: context.repoUrl,
            rag_sources: ragSources
          })
        }, 30000);

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          res.json(data);
        } else {
          const errText = await aiResponse.text();
          throw new Error(errText || 'AI engine chat request failed');
        }
      } catch (err) {
        console.error('❌ Chat API Error:', err.message);
        const responseMessage = `[Fallback Response] I see you are asking about: "${message}". Currently, the FastAPI AI Engine is offline, so I cannot analyze the full codebase for your query. Please make sure the AI Engine service is running on port 8000.`;
        res.json({ response: responseMessage, sessionId, _mock: true, _mockWarning: 'AI Engine unavailable. Fallback response generated.' });
      }
    });
  } catch (err) {
    console.error('❌ Chat serialization error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An internal error occurred while processing your message.' });
    }
  }
});

export default router;
