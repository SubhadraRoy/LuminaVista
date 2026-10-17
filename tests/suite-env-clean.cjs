// tests/suite-env-clean.cjs
// Automated verification that no .env files exist in working tree or git history

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('\n=================================================================');
console.log('   LUMINAVISTA OS: .ENV PURGE & ZERO-LEAK AUDIT SUITE           ');
console.log('=================================================================\n');

// 1. Audit Working Directory
console.log('[SECTION 1: Disk & Working Tree Audit]');
function findEnvFilesOnDisk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findEnvFilesOnDisk(fullPath));
    } else {
      if (entry.name === '.env' || entry.name.startsWith('.env.') || entry.name.endsWith('.env')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const diskEnvFiles = findEnvFilesOnDisk(rootDir);
assert.strictEqual(diskEnvFiles.length, 0, `Found .env files on disk: ${diskEnvFiles.join(', ')}`);
console.log('  ✓ PASS: Zero .env files found anywhere on disk in project tree');

// 2. Audit Git Tracking (Index)
console.log('\n[SECTION 2: Git Index Tracking Audit]');
const trackedFiles = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' }).split('\n');
const trackedEnv = trackedFiles.filter(f => f === '.env' || f.startsWith('.env.') || f.endsWith('.env') || f.includes('/.env'));
assert.strictEqual(trackedEnv.length, 0, `Found tracked .env files in git index: ${trackedEnv.join(', ')}`);
console.log('  ✓ PASS: Zero .env files tracked in current git index');

// 3. Audit Entire Git Commit History
console.log('\n[SECTION 3: Full Git Commit History Audit]');
const historyFiles = execSync('git log --all --full-history --pretty=format: --name-only', { cwd: rootDir, encoding: 'utf8' })
  .split('\n')
  .map(f => f.trim())
  .filter(Boolean);
const historicalEnv = Array.from(new Set(historyFiles.filter(f => f === '.env' || f.startsWith('.env.') || f.endsWith('.env') || f.includes('/.env'))));
assert.strictEqual(historicalEnv.length, 0, `Found historical .env files in git commits: ${historicalEnv.join(', ')}`);
console.log('  ✓ PASS: Zero .env files found across all historical commits and branches');

// 4. Audit Ignore Rules
console.log('\n[SECTION 4: Ignore Rules Hardening Audit]');
const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
assert(gitignore.includes('.env'), '.gitignore must include .env');
assert(gitignore.includes('.env.*'), '.gitignore must include .env.*');
assert(gitignore.includes('**/.env*'), '.gitignore must include **/.env*');
console.log('  ✓ PASS: .gitignore comprehensively blocks all .env file patterns');

const vercelignore = fs.readFileSync(path.join(rootDir, '.vercelignore'), 'utf8');
assert(vercelignore.includes('.env'), '.vercelignore must include .env');
assert(vercelignore.includes('.env.*'), '.vercelignore must include .env.*');
console.log('  ✓ PASS: .vercelignore comprehensively blocks all .env deployment patterns');

console.log('\n=================================================================');
console.log('🎉 ALL .ENV ZERO-LEAK AUDITS PASSED WITH ZERO ERRORS!');
console.log('=================================================================\n');
