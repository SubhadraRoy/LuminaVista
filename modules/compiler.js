// modules/compiler.js - Cloud Compilers & E2B Code Runner

(function(window) {
  'use strict';

  let htmlDebounceTimer = null;

  function updateRunButtonLabel(lang) {
    const btnText = document.getElementById("btnRunSandboxText");
    const btnIcon = document.getElementById("btnRunSandboxIcon");
    const btn = document.getElementById("btnRunSandbox");
    const outHeader = document.getElementById("sandboxOutputHeader");
    const srcHeader = document.getElementById("sandboxSourceHeader");

    if (lang === 'html') {
      if (btnText) btnText.textContent = "Render Preview";
      if (btnIcon) btnIcon.setAttribute("data-lucide", "eye");
      if (btn) btn.title = "Render HTML DOM Preview";
      if (outHeader) outHeader.textContent = "Live DOM Preview:";
      if (srcHeader) srcHeader.textContent = "HTML Source Buffer:";
    } else if (lang === 'python') {
      if (btnText) btnText.textContent = "Run Python";
      if (btnIcon) btnIcon.setAttribute("data-lucide", "play");
      if (btn) btn.title = "Run Python 3.10 Code";
      if (outHeader) outHeader.textContent = "Runtime Output Stream:";
      if (srcHeader) srcHeader.textContent = "Python Source Buffer:";
    } else if (lang === 'bash') {
      if (btnText) btnText.textContent = "Execute Bash";
      if (btnIcon) btnIcon.setAttribute("data-lucide", "terminal");
      if (btn) btn.title = "Execute Bash Script in MicroVM";
      if (outHeader) outHeader.textContent = "Runtime Output Stream:";
      if (srcHeader) srcHeader.textContent = "Bash Source Buffer:";
    } else if (lang === 'sql') {
      if (btnText) btnText.textContent = "Run Query";
      if (btnIcon) btnIcon.setAttribute("data-lucide", "database");
      if (btn) btn.title = "Execute SQL Query";
      if (outHeader) outHeader.textContent = "Query Results / Stream:";
      if (srcHeader) srcHeader.textContent = "SQL Query Buffer:";
    } else {
      // cpp, java
      if (btnText) btnText.textContent = "Compile & Run";
      if (btnIcon) btnIcon.setAttribute("data-lucide", "play");
      if (btn) btn.title = `Compile & Run ${lang.toUpperCase()}`;
      if (outHeader) outHeader.textContent = "Runtime Output Stream:";
      if (srcHeader) srcHeader.textContent = `${lang.toUpperCase()} Source Buffer:`;
    }
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons(); } catch (_) {}
    }
  }

  function setSandboxLanguage(lang) {
    window.currentSbLang = lang;
    ["sbLangHtml", "sbLangPy", "sbLangCpp", "sbLangJava", "sbLangBash", "sbLangSql"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = "px-2.5 sm:px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white cursor-pointer";
    });

    const activeBtnMap = {
      'html': 'sbLangHtml',
      'python': 'sbLangPy',
      'cpp': 'sbLangCpp',
      'java': 'sbLangJava',
      'bash': 'sbLangBash',
      'sql': 'sbLangSql'
    };
    const activeEl = document.getElementById(activeBtnMap[lang]);
    if (activeEl) activeEl.className = "px-2.5 sm:px-3 py-1.5 rounded-lg bg-cyan-500 text-black font-bold cursor-pointer";

    const frameWrap = document.getElementById("sandboxIframeWrapper");
    const outWrap = document.getElementById("sandboxStdoutWrapper");

    if (lang === 'html') {
      if (frameWrap) frameWrap.classList.remove("hidden");
      if (outWrap) outWrap.classList.add("hidden");
    } else {
      if (frameWrap) frameWrap.classList.add("hidden");
      if (outWrap) outWrap.classList.remove("hidden");
    }

    updateRunButtonLabel(lang);
    initCompilerSample(lang);

    if (lang === 'html') {
      const codeArea = document.getElementById("sandboxCodeInput");
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame && codeArea && codeArea.value) {
        previewFrame.srcdoc = codeArea.value;
      }
    }
  }

  function initCompilerSample(lang) {
    const codeArea = document.getElementById("sandboxCodeInput");
    if (!codeArea) return;
    if (codeArea.value.trim().length > 0 && !codeArea.getAttribute("data-sample")) return;

    const samples = {
      'html': "<!DOCTYPE html>\n<html>\n<body style='background:#111;color:#00f2fe;font-family:sans-serif;padding:20px;'>\n  <h2>Live HTML DOM Sandbox</h2>\n  <p>Edits render instantly without server roundtrips.</p>\n</body>\n</html>",
      'python': "# Python 3.10 Compute Engine\nimport sys\n\ndef fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        yield a\n        a, b = b, a + b\n\nprint(f'Runtime Python: {sys.version}')\nprint('Fibonacci sequence:', list(fibonacci(10)))",
      'cpp': "// C++ 10.2 GCC Runtime\n#include <iostream>\n#include <vector>\n#include <numeric>\n\nint main() {\n    std::vector<int> data = {10, 20, 30, 40, 50};\n    int total = std::accumulate(data.begin(), data.end(), 0);\n    std::cout << \"C++ Cloud Binary Output: Vector sum = \" << total << std::endl;\n    return 0;\n}",
      'java': "// Java 15 OpenJDK\nimport java.util.stream.IntStream;\n\npublic class Main {\n    public static void main(String[] args) {\n        int sum = IntStream.rangeClosed(1, 100).sum();\n        System.out.println(\"Java Cloud Compute: Sum 1..100 = \" + sum);\n    }\n}",
      'bash': "# Bash MicroVM Testing\necho 'Native Bash Running in Firecracker VM'\ncat /etc/os-release | grep PRETTY_NAME",
      'sql': "-- SQLite In-Memory Database Sandbox\nCREATE TABLE employees (\n    id INTEGER PRIMARY KEY,\n    name TEXT NOT NULL,\n    department TEXT NOT NULL,\n    salary INTEGER\n);\n\nINSERT INTO employees (name, department, salary) VALUES\n    ('Subhadra Roy', 'Architecture', 185000),\n    ('Elena Vance', 'AI Core', 165000),\n    ('Marcus Drake', 'Security Ops', 145000);\n\nSELECT department, COUNT(*) as staff_count, AVG(salary) as avg_salary\nFROM employees\nGROUP BY department\nORDER BY avg_salary DESC;"
    };

    codeArea.value = samples[lang] || "";
    codeArea.setAttribute("data-sample", "true");

    if (lang === 'html') {
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame) previewFrame.srcdoc = codeArea.value;
    }
  }

  function onSandboxCodeChange() {
    const el = document.getElementById("sandboxCodeInput");
    if (el) el.removeAttribute("data-sample");
    if (window.currentSbLang === "html") {
      clearTimeout(htmlDebounceTimer);
      htmlDebounceTimer = setTimeout(() => {
        const previewFrame = document.getElementById("sandboxPreviewFrame");
        if (previewFrame && el) previewFrame.srcdoc = el.value;
      }, 200);
    }
  }

  async function runSandboxCode() {
    const codeEl = document.getElementById("sandboxCodeInput");
    if (!codeEl) return;
    const code = codeEl.value;
    const out = document.getElementById("sandboxStdoutWrapper");
    const frameWrap = document.getElementById("sandboxIframeWrapper");
    const lang = window.currentSbLang || "html";

    if (lang === "html") {
      if (frameWrap) frameWrap.classList.remove("hidden");
      if (out) out.classList.add("hidden");
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame) {
        previewFrame.srcdoc = "";
        setTimeout(() => { previewFrame.srcdoc = code; }, 10);
      }
      if (window.showToast) window.showToast("Preview Rendered", "HTML DOM preview refreshed.");
      return;
    }

    // TypeSafe Jev System-1 Code Safety Screening
    const codeSafety = window.LuminaJev ? window.LuminaJev.screenCode(code, lang) : { safe: true };
    if (!codeSafety.safe) {
      if (frameWrap) frameWrap.classList.add("hidden");
      if (out) {
        out.classList.remove("hidden");
        out.textContent = `🛡️ [Jev System-1 Guardrail]: Code Execution Blocked!\nThreat: ${codeSafety.threatCategory}\nReason: ${codeSafety.reason}\n`;
      }
      if (window.showToast) window.showToast("Execution Blocked", "Dangerous code blocked by Jev guardrail.");
      return;
    }

    if (frameWrap) frameWrap.classList.add("hidden");
    if (out) {
      out.classList.remove("hidden");
      out.textContent = `[E2B MicroVM]: Compiling & dispatching ${lang.toUpperCase()}...\n`;
    }

    try {
      // 1. Try dedicated /api/compile endpoint first
      const compRes = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, code })
      });
      if (compRes.ok) {
        const compData = await compRes.json();
        if (out) {
          out.textContent += compData.output || "[Clean execution, no output]";
          if (window.showToast) window.showToast("Execution Complete", "Process completed.");
        }
        return;
      } else if (compRes.status === 403) {
        const compData = await compRes.json();
        if (out) {
          out.textContent = `🛡️ [Jev System-1 Guardrail]: ${compData.error || 'Execution Blocked'}\n${compData.details || ''}\n`;
        }
        if (window.showToast) window.showToast("Execution Blocked", compData.error || "Dangerous code blocked.");
        return;
      } else if (compRes.status === 401) {
        if (out) {
          out.textContent = `🔒 [Authentication Required]: Code compiler execution requires an authenticated workspace session. Please sign in or unlock the session.\n`;
        }
        if (window.showToast) window.showToast("Authentication Required", "Sign in required to compile.");
        return;
      }
    } catch (compileErr) {
      // Fallback to /api/terminal
    }

    let cmd = "", ext = "";
    if (lang === 'python') { cmd = "python3 /tmp/sbx.py"; ext = "py"; }
    else if (lang === 'cpp') { cmd = "g++ -O2 /tmp/sbx.cpp -o /tmp/out && /tmp/out"; ext = "cpp"; }
    else if (lang === 'java') { cmd = "javac /tmp/Main.java && cd /tmp && java Main"; ext = "java"; }
    else if (lang === 'bash') { cmd = "bash /tmp/sbx.sh"; ext = "sh"; }
    else if (lang === 'sql') { cmd = "python3 -c \"import sqlite3; conn = sqlite3.connect(':memory:'); cur = conn.cursor(); script = open('/tmp/sbx.sql').read(); [cur.execute(s) for s in script.split(';') if s.strip()]; [print(r) for r in cur.fetchall()]\""; ext = "sql"; }
    
    let safeCode = "";
    try {
      safeCode = btoa(encodeURIComponent(code).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    } catch (e) {
      safeCode = btoa(unescape(encodeURIComponent(code)));
    }
    let filename = ext === 'java' ? 'Main.java' : `sbx.${ext}`;
    const fullCmd = `echo "${safeCode}" | base64 -d > /tmp/${filename} && ${cmd}`;

    // Verify command safety with Jev guardrail before dispatch
    const cmdSafety = window.LuminaJev ? window.LuminaJev.screenCommand(fullCmd) : { safe: true };
    if (!cmdSafety.safe) {
      if (out) {
        out.classList.remove("hidden");
        out.textContent = `🛡️ [Jev System-1 Guardrail]: Command Execution Blocked!\nThreat: ${cmdSafety.threatCategory}\nReason: ${cmdSafety.reason}\n`;
      }
      if (window.showToast) window.showToast("Execution Blocked", cmdSafety.reason || "Dangerous shell command blocked.");
      return;
    }

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: fullCmd, files: [] })
      });

      const data = await res.json();
      if (out) {
        if (res.ok) {
          out.textContent += (data.stdout || "") + (data.stderr ? "\n" + data.stderr : "");
          if (!data.stdout && !data.stderr) out.textContent += "\n[Clean execution, no output]";
          if (window.showToast) window.showToast("Execution Complete", `Process completed.`);
        } else if (res.status === 401) {
          out.textContent = `🔒 [Authentication Required]: Terminal code execution requires an authenticated workspace session.\n`;
        } else {
          out.textContent += `\n[Execution Failure]: ${data.error || 'Server error'}`;
        }
      }
    } catch (err) {
      if (out) {
        out.textContent += `\n[Network Fault]: ${err.message}`;
      }
    }
  }

  function clearCompilerOutput() {
    const out = document.getElementById("sandboxStdoutWrapper");
    if (out) out.textContent = "";
    if (window.currentSbLang === "html") {
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame) {
        previewFrame.srcdoc = "<!DOCTYPE html><html><body style='background:#111;color:#666;font-family:sans-serif;padding:20px;'><p>Preview cleared.</p></body></html>";
      }
    }
  }

  function onSandboxTabActivated() {
    updateRunButtonLabel(window.currentSbLang || 'html');
    if (window.currentSbLang === 'html') {
      const codeArea = document.getElementById("sandboxCodeInput");
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame && codeArea && !previewFrame.srcdoc) {
        previewFrame.srcdoc = codeArea.value;
      }
    }
  }

  // Export to window
  window.setSandboxLanguage = setSandboxLanguage;
  window.initCompilerSample = initCompilerSample;
  window.onSandboxCodeChange = onSandboxCodeChange;
  window.runSandboxCode = runSandboxCode;
  window.runSandboxCodeE2B = runSandboxCode; // alias for compatibility
  window.clearCompilerOutput = clearCompilerOutput;
  window.onSandboxTabActivated = onSandboxTabActivated;

})(window);
