// The Mac build makes an Apple Silicon and an Intel app from one machine, so sharp needs both of its Mac binaries;
// npm only installs the one for the machine it runs on. This adds the other, at the versions sharp itself asks for.
const { execSync } = require('child_process');
const deps = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'node_modules', 'sharp', 'package.json'), 'utf8')).optionalDependencies;
const want = Object.entries(deps).filter(([n]) => /darwin-(arm64|x64)$/.test(n)).map(([n, v]) => `${n}@${v}`);
console.log('sharp for Mac:', want.join(' '));
execSync(`npm install --no-save --force --no-audit --no-fund ${want.join(' ')}`, { stdio: 'inherit' });
