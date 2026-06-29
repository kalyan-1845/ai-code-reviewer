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
    const totalLines = file.content ? file.content.split('\n').length : 50;
    const getRandomLine = () => Math.max(1, Math.floor(Math.random() * totalLines));

    reviews[file.name] = {
      bugs: [
        {
          type: "Null Pointer Risk",
          line: getRandomLine(),
          description: `Variables should be validated before use to prevent potential runtime crashes in ${file.name}.`,
          suggestion: "Add a standard null-check check (e.g. `if (!variable)` or `if variable is None`)."
        }
      ],
      security: [
        {
          type: "Hardcoded API Key Check",
          line: getRandomLine(),
          description: "Potential hardcoded credentials detected. API keys should always be loaded from environment variables (.env).",
          suggestion: "Move the key to a `.env` file and load using standard environment managers."
        }
      ],
      optimization: [
        {
          type: "Complexity Reduction",
          line: getRandomLine(),
          description: "Avoid using nested iterations if time complexity grows quadratically. Consider using a Map/Dictionary lookup.",
          suggestion: "Implement a mapping cache instead of performing dual-nested loops."
        }
      ],
      styling: [
        {
          type: "Naming Convention",
          line: getRandomLine(),
          description: "CamelCase or snake_case format mismatch detected on function declaration.",
          suggestion: "Reformat variable or function definitions to conform to standard styling rules."
        }
      ]
    };
  });

  // Derive repo name from first file's path; use fallback for root-level files
  const repoParts = files[0].name.split('/');
  const repoName = repoParts.length > 1 ? repoParts[0] : 'Repository';

  // Mock generated README
  const mockReadme = `# 🚀 ${repoName}

This repository is powered by RepoSage AI Copilot (Audited using **${model}**). 

## 🏗️ Folder Layout
${files.map(f => `- 📄 **${f.name}**`).join('\n')}

## 💻 Tech Stack
- Source files: ${files.length} modules analyzed.

Generated automatically by **RepoSage AI Generator**.`;

  // Mock generated Mermaid flowchart
  const mockMermaid = `graph TD\n  Root["📦 ${repoName}"]\n  ${files.slice(0, 5).map((f, i) => `  Root --> File_${i}["📄 ${f.name.split('/').pop()}"]`).join('\n')}`;

  return {
    fileReviews: reviews,
    generatedReadme: mockReadme,
    mermaidDiagram: mockMermaid
  };
}
