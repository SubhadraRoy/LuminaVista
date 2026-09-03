export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { language, code } = req.body;

  // Handle SQL securely in the backend (Mocked database engine)
  if (language === 'sql') {
    return res.status(200).json({ 
      output: `=== GODx Cloud SQL Engine ===\nExecuting Query: ${code.trim()}\n\n| ID | TABLE_NAME           | ROWS |\n|----|----------------------|------|\n| 1  | EXM_USERS            | 42   |\n| 2  | SYSTEM_LOGS          | 104  |\n\nQuery OK (0.012ms)` 
    });
  }

  // Piston API Language Mapping
  const langMap = {
    'python': { language: 'python', version: '3.10.0' },
    'cpp': { language: 'c++', version: '10.2.0' },
    'java': { language: 'java', version: '15.0.2' }
  };

  const config = langMap[language];
  if (!config) return res.status(400).json({ error: "Unsupported compiler language" });

  try {
    // Send to Free Piston Execution Engine
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: config.language,
        version: config.version,
        files: [{ content: code }]
      })
    });

    const data = await response.json();
    
    if (data.run) {
      const output = data.run.output || data.run.stderr || "Program exited with no output.";
      return res.status(200).json({ output: output.trim() });
    } else {
      return res.status(500).json({ error: data.message || "Compilation failed." });
    }
  } catch (err) {
    return res.status(502).json({ error: "Execution Engine Unreachable. " + err.message });
  }
}