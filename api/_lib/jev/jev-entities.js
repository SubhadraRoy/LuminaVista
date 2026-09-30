/**
 * api/_lib/jev/jev-entities.js - Deep Entity, Framework & AST Heuristic Extraction
 * Extracts programming languages, frameworks, development tools, ports, dates, and file targets.
 */

export function extractJevEntities(prompt = '', vfsFiles = []) {
  const p = String(prompt).toLowerCase();
  const pTrim = String(prompt).trim();

  const entities = {
    languages: [],
    frameworks: [],
    tools: [],
    files: [],
    dates: [],
    ports: [],
    commands: [],
    isMultiStep: false
  };

  // 1. Languages
  if (/\b(python|py)\b/i.test(p)) entities.languages.push('python');
  if (/\b(javascript|node|js)\b/i.test(p)) entities.languages.push('javascript');
  if (/\b(typescript|ts)\b/i.test(p)) entities.languages.push('typescript');
  if (/\b(html|css|tailwind)\b/i.test(p)) entities.languages.push('html');
  if (/\b(sql|database|postgres|sqlite|mysql|prisma|drizzle)\b/i.test(p)) entities.languages.push('sql');
  if (/\b(bash|shell|sh|zsh)\b/i.test(p)) entities.languages.push('bash');
  if (/\b(rust|cargo)\b/i.test(p)) entities.languages.push('rust');
  if (/\b(golang|go)\b/i.test(p)) entities.languages.push('go');
  if (/\b(c\+\+|cpp)\b/i.test(p)) entities.languages.push('cpp');
  if (/\b(java|kotlin)\b/i.test(p)) entities.languages.push('java');

  // 2. Frameworks & Libraries
  if (/\b(react|react\.js|jsx)\b/i.test(p)) entities.frameworks.push('react');
  if (/\b(next|nextjs|next\.js)\b/i.test(p)) entities.frameworks.push('nextjs');
  if (/\b(vue|vuejs|nuxt)\b/i.test(p)) entities.frameworks.push('vue');
  if (/\b(svelte|sveltekit)\b/i.test(p)) entities.frameworks.push('svelte');
  if (/\b(tailwind|tailwindcss)\b/i.test(p)) entities.frameworks.push('tailwind');
  if (/\b(express|expressjs)\b/i.test(p)) entities.frameworks.push('express');
  if (/\b(fastify)\b/i.test(p)) entities.frameworks.push('fastify');
  if (/\b(flask)\b/i.test(p)) entities.frameworks.push('flask');
  if (/\b(django)\b/i.test(p)) entities.frameworks.push('django');
  if (/\b(fastapi)\b/i.test(p)) entities.frameworks.push('fastapi');

  // 3. DevOps & Systems Tools
  if (/\b(docker|container|dockerfile|compose)\b/i.test(p)) entities.tools.push('docker');
  if (/\b(k8s|kubernetes|helm)\b/i.test(p)) entities.tools.push('kubernetes');
  if (/\b(git|github|gitlab|commit|repo)\b/i.test(p)) entities.tools.push('git');
  if (/\b(npm|npx|yarn|pnpm|pip|cargo)\b/i.test(p)) entities.tools.push('package_manager');
  if (/\b(playwright|puppeteer|selenium|cdp)\b/i.test(p)) entities.tools.push('browser_automation');
  if (/\b(redis|memcached)\b/i.test(p)) entities.tools.push('in_memory_cache');

  // 4. Dates & Time Horizons
  if (/\b(today)\b/i.test(p)) entities.dates.push('today');
  if (/\b(tomorrow)\b/i.test(p)) entities.dates.push('tomorrow');
  if (/\b(next\s*weeks?)\b/i.test(p)) entities.dates.push('next_week');
  if (/\b(this\s*week)\b/i.test(p)) entities.dates.push('this_week');
  if (/\b(upcoming|agenda)\b/i.test(p)) entities.dates.push('upcoming');

  // 5. Ports (e.g. 8999, 3000, 8080)
  const portMatches = p.match(/\b(port\s+)?(3000|8000|8080|8999|5000|5432|6379|9222|9223|\d{4,5})\b/gi);
  if (portMatches) {
    portMatches.forEach(pm => {
      const num = pm.replace(/\D/g, '');
      if (num && !entities.ports.includes(num)) entities.ports.push(num);
    });
  }

  // 6. Explicit File Path Detection
  let targetFile = '';
  const pathMatch = pTrim.match(/(?:in|to|file|create|edit|view|read|inspect|patch|modify|update|delete|remove)\s+([a-zA-Z0-9_\-/\\]+\.[a-zA-Z0-9]{1,5})\b/i) ||
                    pTrim.match(/\b([a-zA-Z0-9_\-/\\]+\.(?:js|jsx|ts|tsx|py|html|css|json|sql|md|sh|cjs|mjs|txt|log))\b/i);
  if (pathMatch && pathMatch[1]) {
    targetFile = pathMatch[1].replace(/\\/g, '/');
    entities.files.push(targetFile);
  } else {
    const existingMatch = (vfsFiles || []).find(f => p.includes(f.toLowerCase()));
    if (existingMatch) {
      targetFile = existingMatch;
      entities.files.push(targetFile);
    }
  }

  const targetExists = targetFile ? (vfsFiles || []).some(f => f.toLowerCase() === targetFile.toLowerCase()) : false;

  return {
    entities,
    targetFile,
    targetExists,
    pathMatch: !!pathMatch
  };
}
