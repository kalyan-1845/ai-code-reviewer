export function sanitizeHTML(dirty: string): string;
export function sanitizeForStorage(dirty: string): string;
export function sanitizeMermaidOutput(svg: string): string;
export function sanitizeAuditEntry(entry: Record<string, unknown>): Record<string, unknown>;
export function sanitizeJSON(data: string): string;
