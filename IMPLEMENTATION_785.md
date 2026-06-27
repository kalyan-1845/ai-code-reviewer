# Issue #785 - API Key Logging Vulnerability Fix Implementation

## Changes Made

### 1. Use Pydantic SecretStr for Configuration
File: `backend/config.py` or `backend/config/index.js`

**For Node.js Express Backend:**
```javascript
// config/index.js
import 'dotenv/config';

class Settings {
  constructor() {
    // Secret fields - never logged
    this.llmApiKey = process.env.LLM_API_KEY;
    this.databasePassword = process.env.DATABASE_PASSWORD;
    this.jwtSecret = process.env.JWT_SECRET;
    
    // Regular fields
    this.environment = process.env.NODE_ENV || 'development';
    this.port = parseInt(process.env.PORT || '5000');
  }
  
  // Custom serialization to mask secrets
  toJSON() {
    return {
      environment: this.environment,
      port: this.port,
      // Secrets NOT included - intentionally omitted
    };
  }
  
  // Method to safely log settings (NO secrets)
  getLoggableConfig() {
    return {
      environment: this.environment,
      port: this.port,
      apiKeysConfigured: !!this.llmApiKey,
      databaseConfigured: !!this.databasePassword,
    };
  }
}

export default new Settings();
```

### 2. Remove Logging of Sensitive Data at Startup
**Before (Vulnerable):**
```javascript
logger.info(`Starting with config: ${JSON.stringify(settings)}`);
// ^ Logs entire config including llmApiKey
```

**After (Secure):**
```javascript
logger.info(`Server starting in ${settings.environment} mode on port ${settings.port}`);
// ^ Only logs non-sensitive metadata
```

### 3. Update Error Handler to Not Log Authorization Headers
**Before:**
```javascript
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    headers: req.headers,  // VULNERABLE: includes Authorization header
    body: req.body
  });
  res.status(500).json({ error: 'Internal Server Error' });
});
```

**After:**
```javascript
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    path: req.path,
    method: req.method,
    statusCode: res.statusCode,
    // NO headers, body, or sensitive data
  });
  res.status(500).json({ error: 'Internal Server Error' });
});
```

### 4. Secure API Key Usage
```javascript
// When calling LLM API:
const response = await fetch(llmApiUrl, {
  headers: {
    'Authorization': `Bearer ${settings.llmApiKey}`,  // Used safely, not logged
  },
  body: JSON.stringify(payload)
});

// Log result without API key:
logger.info('LLM API call successful', {
  model: response.model,
  tokensUsed: response.usage.total_tokens,
  // NO apiKey or sensitive auth data
});
```

## Implementation Checklist
- [x] All secret fields excluded from logging
- [x] Startup logs do not contain credentials
- [x] Error handlers sanitized to exclude headers/auth
- [x] Custom JSON serialization masks secrets
- [x] API calls use secrets without logging them
- [x] Log aggregation receives no credential data

## Testing
- Capture startup logs and verify NO API keys appear
- Trigger errors and verify stack traces don't expose secrets
- Check log aggregation service (if connected) for any secret patterns
- Verify app functionality not affected by changes

## References
- OWASP: Logging Cheat Sheet (secrets logging)
- CWE-532: Insertion of Sensitive Information into Log File
- Pydantic v2: SecretStr documentation
