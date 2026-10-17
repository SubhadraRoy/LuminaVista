const fs = require('fs');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

console.log('Top level dependencies:');
for (const [dep, spec] of Object.entries(lock.packages[''].dependencies || {})) {
  const resolved = lock.packages[`node_modules/${dep}`];
  console.log(`- ${dep}: requested ${spec}, resolved ${resolved ? resolved.version : 'missing'}`);
}
for (const [dep, spec] of Object.entries(lock.packages[''].devDependencies || {})) {
  const resolved = lock.packages[`node_modules/${dep}`];
  console.log(`- ${dep} (dev): requested ${spec}, resolved ${resolved ? resolved.version : 'missing'}`);
}

console.log('\nChecking for any install/postinstall/preinstall in package-lock packages...');
let foundHooks = 0;
for (const [pkgPath, data] of Object.entries(lock.packages)) {
  if (data.hasInstallScript) {
    console.log(`[Lifecycle hook flag] ${pkgPath}: hasInstallScript=true`);
    foundHooks++;
  }
}
if (foundHooks === 0) {
  console.log('Zero packages have install / postinstall hooks.');
}

console.log('\nTotal packages in lockfile:', Object.keys(lock.packages).length);
