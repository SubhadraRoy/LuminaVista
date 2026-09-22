// modules/compiler.js - Cloud Compilers & E2B Code Runner

(function(window) {
  'use strict';

  function setSandboxLanguage(lang) {
    window.currentSbLang = lang;
    ["sbLangHtml", "sbLangPy", "sbLangCpp", "sbLangJava", "sbLangBash"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = "px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white cursor-pointer";
    });

    const activeBtnMap = {
      'html': 'sbLangHtml',
      'python': 'sbLangPy',
      'cpp': 'sbLangCpp',
      'java': 'sbLangJava',
      'bash': 'sbLangBash'
    };
    const activeEl = document.getElementById(activeBtnMap[lang]);
    if (activeEl) activeEl.className = "px-3 py-1.5 rounded-lg bg-cyan-500 text-black font-bold cursor-pointer";

    const frameWrap = document.getElementById("sandboxIframeWrapper");
    const outWrap = document.getElementById("sandboxStdoutWrapper");

    if (lang === 'html') {
      if (frameWrap) frameWrap.classList.remove("hidden");
      if (outWrap) outWrap.classList.add("hidden");
    } else {
      if (frameWrap) frameWrap.classList.add("hidden");
      if (outWrap) outWrap.classList.remove("hidden");
    }
    initCompilerSample(lang);
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
      'bash': "# Bash MicroVM Testing\necho 'Native Bash Running in Firecracker VM'\ncat /etc/os-release | grep PRETTY_NAME"
    };

    codeArea.value = samples[lang] || "";
    codeArea.setAttribute("data-sample", "true");
  }

  function onSandboxCodeChange() {
    const el = document.getElementById("sandboxCodeInput");
    if (el) el.removeAttribute("data-sample");
  }

  async function runSandboxCode() {
    const codeEl = document.getElementById("sandboxCodeInput");
    if (!codeEl) return;
    const code = codeEl.value;
    const out = document.getElementById("sandboxStdoutWrapper");
    const frameWrap = document.getElementById("sandboxIframeWrapper");
    const lang = window.currentSbLang || "python";

    if (lang === "html") {
      if (frameWrap) frameWrap.classList.remove("hidden");
      if (out) out.classList.add("hidden");
      const previewFrame = document.getElementById("sandboxPreviewFrame");
      if (previewFrame) previewFrame.srcdoc = code;
      if (window.showToast) window.showToast("HTML Rendered", "DOM preview refreshed.");
      return;
    }

    if (frameWrap) frameWrap.classList.add("hidden");
    if (out) {
      out.classList.remove("hidden");
      out.textContent = `[E2B MicroVM]: Compiling & dispatching ${lang.toUpperCase()}...\n`;
    }

    let cmd = "", ext = "";
    if (lang === 'python') { cmd = "python3 /tmp/sbx.py"; ext = "py"; }
    if (lang === 'cpp') { cmd = "g++ -O2 /tmp/sbx.cpp -o /tmp/out && /tmp/out"; ext = "cpp"; }
    if (lang === 'java') { cmd = "javac /tmp/Main.java && cd /tmp && java Main"; ext = "java"; }
    if (lang === 'bash') { cmd = "bash /tmp/sbx.sh"; ext = "sh"; }
    
    const safeCode = btoa(unescape(encodeURIComponent(code)));
    let filename = ext === 'java' ? 'Main.java' : `sbx.${ext}`;
    const fullCmd = `echo "${safeCode}" | base64 -d > /tmp/${filename} && ${cmd}`;

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
        } else {
          out.textContent += `\n[Execution Failure]: ${data.error}`;
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
  }

  // Export to window
  window.setSandboxLanguage = setSandboxLanguage;
  window.initCompilerSample = initCompilerSample;
  window.onSandboxCodeChange = onSandboxCodeChange;
  window.runSandboxCode = runSandboxCode;
  window.runSandboxCodeE2B = runSandboxCode; // alias for compatibility
  window.clearCompilerOutput = clearCompilerOutput;

})(window);
