export const rules = [
  {
    type: "AWS Access Key Check",
    regex: /AKIA[0-9A-Z]{16}/g,
    description: "Potential AWS Access Key ID detected. If pushed to a public repository, malicious parties can hijack your AWS cloud infrastructure."
  },
  {
    type: "GitHub Personal Access Token",
    regex: /ghp_[a-zA-Z0-9]{36}/g,
    description: "Hardcoded GitHub Personal Access Token detected. Unauthorized users can gain complete read/write access to your repositories."
  },
  {
    type: "Stripe Secret API Key",
    regex: /sk_live_[0-9a-zA-Z]{24}/g,
    description: "Hardcoded live Stripe Secret Key detected. This can expose customer transaction history or result in financial exploitation."
  },
  {
    type: "Google Cloud API Key",
    regex: /AIzaSy[a-zA-Z0-9-_]{33}/g,
    description: "Hardcoded Google Cloud API Key detected. Allows unauthorized usage of GCP billing services and resources."
  },
  {
    type: "Database Connection Credentials",
    regex: /(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/)[a-zA-Z0-9_]+:[a-zA-Z0-9_]+@/gi,
    description: "Database connection credentials detected directly in code. Exposes the database tables to global read/write breaches."
  },
  {
    type: "Slack Incoming Webhook",
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8}\/B[A-Z0-9]{8}\/[A-Za-z0-9]{24}/g,
    description: "Hardcoded Slack Incoming Webhook detected. Allows external parties to send spam or phish users inside your workspace channels."
  },
  {
    type: "Generic Private Key",
    regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/gi,
    description: "Generic Private Key detected. Committing private keys to a repository exposes critical encryption keys, identity access, or infrastructure certificates."
  },
  {
    type: "Common Environment Credential",
    regex: /(?:password|passwd|secret|secret_key|private_key|api_key|token|auth_token)\s*=\s*(['"])([^\n]{0,256}?)\1/gi,
    description: "Hardcoded credential (e.g. password, secret key, token) detected. Storing raw configurations in code commits is a major security risk."
  },
  {
    type: "Twilio Account SID",
    regex: /\bAC[a-f0-9]{32}\b/gi,
    description: "Potential Twilio Account SID detected. Exposing your Twilio SID allows unauthorized API access and billing charges."
  },
  {
    type: "Twilio Auth Token",
    regex: /(?:twilio_auth|twilio_token|auth_token)\s*[:=]\s*['"][a-f0-9]{32}['"]/gi,
    description: "Potential Twilio Auth Token detected. Exposing this token allows attackers to authenticate and use your Twilio account."
  },
  {
    type: "JWT Token Check",
    regex: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+\b/g,
    description: "Potential hardcoded JSON Web Token (JWT) detected. Exposing JWT credentials allows authentication bypass or identity impersonation."
  },
  {
    type: "Generic API Key / Token",
    regex: /(?:api_key|apikey|secret_key|auth_token|client_secret)\b\s*[:=]\s*['"]([A-Za-z0-9-_]{16,64})['"]/gi,
    description: "Potential hardcoded Generic API Key or Token detected. This can lead to unauthorized service integration access."
  },
  {
    type: "Hardcoded IPv4 Address",
    regex: /\b(?!127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)(?!0\.0\.0\.0\b)(?!255\.255\.255\.255\b)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    description: "🌐 [Network/Crypto Leak] Hardcoded IPv4 address detected. Exposing internal or public IP addresses in source code reveals network topology and can assist attackers in reconnaissance or lateral movement."
  },
  {
    type: "Ethereum (ETH) Wallet Address",
    regex: /\b0x[0-9a-fA-F]{40}\b/g,
    description: "🪙 [Network/Crypto Leak] Hardcoded Ethereum wallet address detected. Attackers scrape repositories for wallet addresses to target phishing campaigns or trace financial activity."
  },
  {
    type: "Bitcoin (BTC) Wallet Address",
    regex: /\b(?:1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[0-9a-z]{25,39})\b/g,
    description: "🪙 [Network/Crypto Leak] Hardcoded Bitcoin wallet address detected. Committing cryptocurrency wallet addresses to public repositories exposes them to scraping bots and targeted attacks."
  }
];

const MAX_LINE_LENGTH = (n => Number.isFinite(n) ? n : 10000)(parseInt(process.env.SECRETS_MAX_LINE_LENGTH, 10));
const SCAN_TIMEOUT_MS = (n => Number.isFinite(n) ? n : 100)(parseInt(process.env.SECRETS_SCAN_TIMEOUT_MS, 10));
const MAX_CHANGES_PROCESSED = (n => Number.isFinite(n) ? n : 500)(parseInt(process.env.SECRETS_MAX_CHANGES, 10));

export function scanSecretsInChanges(changes) {
  const findings = [];
  const startTime = Date.now();
  let changesProcessed = 0;
  let stoppedEarly = false;
  let reason = null;

  for (const change of changes) {
    if (changesProcessed >= MAX_CHANGES_PROCESSED) {
      stoppedEarly = true;
      reason = `Reached maximum of ${MAX_CHANGES_PROCESSED} changes processed.`;
      break;
    }
    if (Date.now() - startTime > SCAN_TIMEOUT_MS) {
      stoppedEarly = true;
      reason = `Scan timeout of ${SCAN_TIMEOUT_MS}ms exceeded.`;
      break;
    }
    changesProcessed++;
    if (!change || typeof change.content !== 'string') continue;
    if (change.content.length > MAX_LINE_LENGTH) continue;
    for (const rule of rules) {
      if (Date.now() - startTime > SCAN_TIMEOUT_MS) {
        stoppedEarly = true;
        reason = `Scan timeout of ${SCAN_TIMEOUT_MS}ms exceeded.`;
        break;
      }
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(change.content)) !== null) {
        findings.push({
          line: change.line,
          column: match.index,
          type: "security",
          comment: `### 🛡️ Hardcoded Secret Warning\n\nI have detected a hardcoded **${rule.type}** on line **${change.line}**.\n\n#### 💡 Actionable Suggestion\nMove this credential immediately to a protected environment variable (e.g. GitHub Secrets or \`.env\`) and load it dynamically at runtime. DO NOT commit plain secrets to public Git repositories!`
        });
        if (rule.regex.lastIndex === match.index) {
          rule.regex.lastIndex++;
        }
      }
    }
    if (stoppedEarly) break;
  }
  return { findings, truncated: stoppedEarly, totalChanges: changes.length, skippedReason: reason };
}
