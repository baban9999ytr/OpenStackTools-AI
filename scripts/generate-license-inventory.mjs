import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const fallback = {
  '@esbuild/linux-x64': 'node_modules/esbuild/LICENSE.md',
  '@rolldown/binding-linux-x64-gnu': 'node_modules/rolldown/LICENSE',
  '@swc/counter': 'node_modules/@swc/core/LICENSE',
  'cookie-signature': 'node_modules/cookie-signature/Readme.md',
};
const entries = [];
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/') || !metadata.version) continue;
  const directory = join(root, path);
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  const licenseFiles = readdirSync(directory).filter((name) =>
    /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)|^MIT-LICENSE/i.test(name),
  );
  const notices = licenseFiles.map((name) => ({ label: name, path: join(path, name) }));
  if (notices.length === 0 && fallback[pkg.name]) {
    notices.push({ label: `Related package notice: ${fallback[pkg.name]}`, path: fallback[pkg.name] });
  }
  entries.push({ name: pkg.name, version: pkg.version, license: pkg.license ?? 'UNDECLARED', notices });
}
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
let out = '# Third-party dependency and license inventory\n\nGenerated from installed npm packages and their bundled notices. Re-run `node scripts/generate-license-inventory.mjs` after dependency updates. Package metadata alone does not establish rights to other application source or artwork. Related-package notices are identified explicitly; confirm their applicability before distribution.\n\n| Package | Version | Declared license | Notice source |\n| --- | --- | --- | --- |\n';
for (const entry of entries) {
  out += `| ${entry.name} | ${entry.version} | ${entry.license} | ${entry.notices.map((item) => item.label).join(', ') || 'NONE FOUND'} |\n`;
}
out += '\n## Notice texts\n\nThe following text is reproduced from installed packages to retain their license and copyright notices.\n';
for (const entry of entries) {
  for (const notice of entry.notices) {
    let content = readFileSync(join(root, notice.path), 'utf8');
    if (entry.name === 'cookie-signature') content = content.slice(content.indexOf('## License'));
    out += `\n### ${entry.name}@${entry.version} — ${notice.label}\n\n\`\`\`text\n${content.replace(/\`\`\`/g, '\` \` \`')}\n\`\`\`\n`;
  }
}
writeFileSync(join(root, 'docs', 'THIRD_PARTY_LICENSES.md'), out);
console.log(`${entries.length} packages inventoried; ${entries.filter((entry) => entry.notices.length === 0).length} without notice text`);
