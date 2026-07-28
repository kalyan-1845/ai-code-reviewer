export function detectNPlusOne(content, fileName = '') {
  if (typeof content !== 'string') return false;

  if (!/(for|while|\.map|\.forEach)/.test(content)) return false;
  if (!/(\.find|\.query|\.execute|\.select|prisma\.)/.test(content)) return false;

  let inLoop = false;
  let braceDepth = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    if (/(for\s*\(|while\s*\(|\.map\s*\(|\.forEach\s*\()/.test(line)) {
      inLoop = true;
      braceDepth = 0;
    }

    if (inLoop) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      const isOrmCall = /(?:\.find(?:Many|One|All)?|\.query|\.execute|\.select|\.insert|\.update|prisma\.[a-zA-Z]+\.[a-zA-Z]+)\s*\(/.test(line);
      
      if (isOrmCall) {
        return true;
      }

      if (braceDepth <= 0 && line.includes('}')) {
        inLoop = false;
      }
    }
  }

  return false;
}
