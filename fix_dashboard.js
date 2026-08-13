const fs = require('fs');
const file = 'frontend/src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const handleAnalyze = async \(e: React\.FormEvent\) => \{[\s\S]*?\} catch \(err: unknown\) \{/m;

const replacement = `const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setApiError(null);
    setAnalysisResult(null);
    setSelectedFile(null);
    setChatHistory([]);
    setIsLoading(true);
    _setLoadingStep("Cloning repository...");
    try { localStorage.removeItem('reposage_chat_history'); } catch {};

    try {
      const aiSettings = getSavedAiSettings();
      
      const steps = [
        "Cloning repository...",
        "Analyzing files...",
        "Generating review...",
        "Applying security checks..."
      ];
      let stepIndex = 1;
      const stepInterval = setInterval(() => {
        _setLoadingStep(steps[stepIndex]);
        stepIndex = (stepIndex + 1) % steps.length;
      }, 2000);

      const response = await fetch(\`\${API_BASE_URL}/api/analyze\`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": sessionStorage.getItem("reposage_api_key") || "",
        },
        body: JSON.stringify({
          repoUrl,
          company,
          language,
          model: selectedModel,
          temperature: aiSettings.temperature ?? 0.7,
          maxTokens: aiSettings.maxTokens ?? 2048,
          systemPrompt: aiSettings.systemPrompt ?? "",
          batchSize: aiSettings.batchSize ?? 5,
        }),
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Server error occurred during analysis.",
        );
      }

      const data: BackendResponse = await response.json();
      setAnalysisResult(data);
      const currentSessionId = data.sessionPersisted === true ? data.sessionId ?? null : null;
      setSessionId(currentSessionId);
      
      await saveReport(data, repoUrl, currentSessionId);
      persistAuditHistory(data);
      setChatHistory([]);

      const filesList = Object.keys(data.analysis?.fileReviews || {});
      if (filesList.length > 0) {
        setSelectedFile(filesList[0]);
      }
    } catch (err: unknown) {`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log("Dashboard.tsx fixed");
