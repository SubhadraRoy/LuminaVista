const fs = require('fs');
const path = require('path');

function analyzeHtml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = { scripts: [], links: [] };

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('<script') && line.includes('src=')) {
      results.scripts.push({ lineNum, line: line.trim() });
    }
    if (line.includes('<link') && line.includes('href=')) {
      results.links.push({ lineNum, line: line.trim() });
    }
  });

  return results;
}

console.log('=== dashboard.html ===');
const dashboard = analyzeHtml('dashboard.html');
console.log('Scripts:', JSON.stringify(dashboard.scripts, null, 2));
console.log('Links:', JSON.stringify(dashboard.links, null, 2));

console.log('\n=== index.html ===');
if (fs.existsSync('index.html')) {
  const index = analyzeHtml('index.html');
  console.log('Scripts:', JSON.stringify(index.scripts, null, 2));
  console.log('Links:', JSON.stringify(index.links, null, 2));
}

console.log('\n=== 404.html ===');
if (fs.existsSync('404.html')) {
  const f04 = analyzeHtml('404.html');
  console.log('Scripts:', JSON.stringify(f04.scripts, null, 2));
  console.log('Links:', JSON.stringify(f04.links, null, 2));
}
