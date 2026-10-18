// Lance tous les tests Node (sans navigateur). Le test de fumée navigateur est séparé : tests/smoke.mjs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
let fail = 0;
for (const t of ['check-structure.mjs', 'test-tracker.mjs', 'test-physics.mjs', 'test-net.mjs']) {
  const r = spawnSync(process.execPath, [path.join(dir, t)], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}
console.log(fail ? `\n${fail} test(s) en échec` : '\nTous les tests Node passent');
process.exit(fail ? 1 : 0);
