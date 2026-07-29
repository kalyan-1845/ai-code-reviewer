export function detectNPlusOne(content, fileName = '') {
  if (typeof content !== 'string') return false;

  if (!/(for|while|\.map|\.forEach)/.test(content)) return false;
  if (!/(\.find|\.query|\.execute|\.select|\.insert|\.update|prisma\.)/.test(content)) return false;

  let inLoop = false;
  let braceDepth = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    if (/(for\s*\(|while\s*\(|\.map\s*\(|\.forEach\s*\()/.test(line)) {
      inLoop = true;
      braceDepth = 0;
    }

    if (inLoop) {
      // Strip content inside parentheses before counting braces, so braces inside
      // ORM call arguments (e.g. .insert({ data: item })) don't affect loop tracking.
      const parenStripped = line.replace(/\([^)]*\)/g, '');
      braceDepth += (parenStripped.match(/\{/g) || []).length;
      braceDepth -= (parenStripped.match(/\}/g) || []).length;

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
