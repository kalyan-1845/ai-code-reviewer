export function mockAIReview(files, model = 'llama-3.3-70b-versatile') {
  const reviews = {};
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    return {
      fileReviews: {},
      generatedReadme: '',
      mermaidDiagram: ''
    };
  }

  files.forEach(file => {
    reviews[file.name] = {
      bugs: [
        {
          type: "Null Pointer Risk",
          line: Math.floor(Math.random() * 50) + 1,
          description: `Variables should be validated before use to prevent potential runtime crashes in ${file.name}.`,
          suggestion: "Add a standard null-check check (e.g. `if (!variable)` or `if variable is None`)."
        }
      ],
      security: [
        {
          type: "Hardcoded API Key Check",
          line: Math.floor(Math.random() * 20) + 1,
          description: "Potential hardcoded credentials detected. API keys should always be loaded from environment variables (.env).",
          suggestion: "Move the key to a `.env` file and load using standard environment managers."
        }
      ],
      optimization: [
        {
          type: "Complexity Reduction",
          line: Math.floor(Math.random() * 80) + 1,
          description: "Avoid using nested iterations if time complexity grows quadratically. Consider using a Map/Dictionary lookup.",
          suggestion: "Implement a mapping cache instead of performing dual-nested loops."
        }
      ],
      styling: [
        {
          type: "Naming Convention",
          line: Math.floor(Math.random() * 30) + 1,
          description: "CamelCase or snake_case format mismatch detected on function declaration.",
          suggestion: "Reformat variable or function definitions to conform to standard styling rules."
        }
      ]
    };
  });

  // Mock generated README
  const mockReadme = `# 🚀 ${files[0].name.split('/')[0] || 'My Repository'}

This repository is powered by RepoSage AI Copilot (Audited using **${model}**). 

## 🏗️ Folder Layout
${files.map(f => `- 📄 **${f.name}**`).join('\n')}

## 💻 Tech Stack
- Source files: ${files.length} modules analyzed.

Generated automatically by **RepoSage AI Generator**.`;

  // Mock generated Mermaid flowchart
  const mockMermaid = `graph TD\n  Root["📦 ${files[0].name.split('/')[0] || 'Repository'}"]\n  ${files.slice(0, 5).map((f, i) => `  Root --> File_${i}["📄 ${f.name.split('/').pop()}"]`).join('\n')}`;

  return {
    fileReviews: reviews,
    generatedReadme: mockReadme,
    mermaidDiagram: mockMermaid
  };
}
