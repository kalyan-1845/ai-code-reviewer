const fs = require('fs');
const file = 'frontend/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const regexAPI = /import mermaid from "mermaid";/;
const replacementAPI = `import mermaid from "mermaid";\n\nconst API_BASE_URL = (typeof (window as any).__RUNTIME_API_URL__ !== "undefined" ? (window as any).__RUNTIME_API_URL__ : import.meta.env.VITE_API_URL) || "http://localhost:5000";`;

content = content.replace(regexAPI, replacementAPI);

const regexStream = /const \{ reviewText, isStreaming, error: streamError, startStream \} = useStreamingReview\(\);/;
const replacementStream = `const { reviewText, isStreaming, error: streamError } = useStreamingReview();`;

content = content.replace(regexStream, replacementStream);

fs.writeFileSync(file, content);
console.log("Fixed Dashboard types");
