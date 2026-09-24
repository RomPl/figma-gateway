import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
await mkdir(dist, { recursive: true });
for (const entry of await readdir(dist)) {
  await rm(path.join(dist, entry), { recursive: true, force: true });
}
