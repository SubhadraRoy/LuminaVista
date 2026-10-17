const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', '.git', '.agents'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = walk(path.resolve('.'));
const report = [];
let maxLines = 0;
let maxFile = '';
const violations = [];

for (const file of allFiles) {
  try {
    const buf = fs.readFileSync(file);
    const isBinary = buf.slice(0, 512).includes(0);
    if (isBinary) continue;
    const text = buf.toString('utf8');
    const lines = text.split('\n').length;
    const rel = path.relative(path.resolve('.'), file);
    report.push({ file: rel, lines });
    if (lines > maxLines) {
      maxLines = lines;
      maxFile = rel;
    }
    if (lines >= 2000) {
      violations.push({ file: rel, lines });
    }
  } catch (err) {
    console.error('Error reading', file, err.message);
  }
}

report.sort((a, b) => b.lines - a.lines);
console.log('Total text files scanned:', report.length);
console.log('Violations (>= 2,000 lines):', violations.length);
if (violations.length > 0) {
  console.log('VIOLATIONS FOUND:', JSON.stringify(violations, null, 2));
} else {
  console.log('CONFIRMED: ALL files are strictly < 2,000 lines!');
}
console.log('Top 15 largest files:');
report.slice(0, 15).forEach((item, i) => console.log(`  ${i+1}. ${item.file}: ${item.lines} lines`));
