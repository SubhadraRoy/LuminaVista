const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const dirs = ['api', path.join('api', '_lib'), 'modules'];

let fileCount = 0;
let failed = 0;

for (const dir of dirs) {
  const fullDir = path.join(rootDir, dir);
  if (!fs.existsSync(fullDir)) continue;

  const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(fullDir, file);
    try {
      execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
      fileCount++;
    } catch (err) {
      console.error(`Syntax Error in ${file}:`, err.message);
      failed++;
    }
  }
}

if (failed === 0) {
  console.log(`✓ All ${fileCount} JavaScript modules passed syntax validation.`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} syntax error(s) detected.`);
  process.exit(1);
}
