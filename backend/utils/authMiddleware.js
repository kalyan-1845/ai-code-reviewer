import crypto from 'crypto';

export const requireApiKey = (req, res, next) => {
  // Get the API key from the request headers
  const providedKey = req.headers['x-api-key'];
  const validKey = process.env.REPOSAGE_API_KEY;

  // Security check: Ensure the server admin actually configured a key
  if (!validKey) {
    console.error('SECURITY WARNING: REPOSAGE_API_KEY is not set in backend/.env');
    return res.status(500).json({ error: 'Server misconfiguration: Authentication is not set up.' });
  }

  if (!providedKey) {
    console.warn(`Unauthorized request attempt to ${req.originalUrl}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
  }

  // Validate the provided key
  try {
    const providedBuffer = Buffer.from(providedKey, 'utf8');
    const validBuffer = Buffer.from(validKey, 'utf8');
    if (providedBuffer.length !== validBuffer.length || !crypto.timingSafeEqual(providedBuffer, validBuffer)) {
      console.warn(`Unauthorized request attempt to ${req.originalUrl}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
  }

  // If the key matches, proceed to the actual route
  next();
};
