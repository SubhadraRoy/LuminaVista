const fs = require('fs');
const path = require('path');

function scanDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.agents' && file !== 'tests') {
        scanDir(fullPath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.html')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = scanDir('.');
const results = [];

const patterns = [
  { name: 'createElement script', regex: /document\.createElement\s*\(\s*['"]script['"]\s*\)/g },
  { name: 'dynamic import', regex: /import\s*\(/g },
  { name: 'external unpkg/cdnjs/jsdelivr/cdn', regex: /https?:\/\/(unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|cdn\.tailwindcss\.com)[^'"`\s]*/g },
  { name: 'postinstall or hook', regex: /postinstall|preinstall/g }
];

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const p of patterns) {
      if (p.regex.test(line)) {
        results.push({
          file: filePath,
          lineNum: idx + 1,
          pattern: p.name,
          snippet: line.trim().slice(0, 140)
        });
      }
      p.regex.lastIndex = 0; // reset regex
    }
  });
}

console.log(JSON.stringify(results, null, 2));
