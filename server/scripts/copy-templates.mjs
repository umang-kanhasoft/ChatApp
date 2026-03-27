import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = path.resolve('src', 'template');
const destinationDir = path.resolve('dist', 'template');

await fs.rm(destinationDir, { recursive: true, force: true });
await fs.mkdir(destinationDir, { recursive: true });
await fs.cp(sourceDir, destinationDir, { recursive: true });
