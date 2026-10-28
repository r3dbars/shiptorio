import { mkdir, chmod, open } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function writePrivateJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const file = await open(path, 'w', 0o600);
  try { await file.chmod(0o600); await file.writeFile(JSON.stringify(value)); }
  finally { await file.close(); }
}
