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
    regex: /(?:password|passwd|secret|secret_key|private_key|api_key|token|auth_token)\s*=\s*['"][^'"]+['"]/gi,
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
    regex: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*\b/g,
    description: "Potential hardcoded JSON Web Token (JWT) detected. Exposing JWT credentials allows authentication bypass or identity impersonation."
  },
  {
    type: "Generic API Key / Token",
    regex: /(?:api_key|apikey|secret_key|auth_token|client_secret)\b\s*[:=]\s*['"]([A-Za-z0-9-_]{16,})['"]/gi,
    description: "Potential hardcoded Generic API Key or Token detected. This can lead to unauthorized service integration access."
  }
];

export function scanSecretsInChanges(changes) {
  const findings = [];
  for (const change of changes) {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(change.content)) {
        findings.push({
          line: change.line,
          type: "security",
          comment: `### 🛡️ Hardcoded Secret Warning\n\nI have detected a hardcoded **${rule.type}** on line **${change.line}**.\n\n#### 💡 Actionable Suggestion\nMove this credential immediately to a protected environment variable (e.g. GitHub Secrets or \`.env\`) and load it dynamically at runtime. DO NOT commit plain secrets to public Git repositories!`
        });
      }
    }
  }
  return findings;
}
