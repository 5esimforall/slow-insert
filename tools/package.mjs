import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = new URL("../module/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("module.json", source), "utf8"));
const destination = new URL(`../dist/slow-insert-v${manifest.version}.zip`, import.meta.url);
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
// The development directory is "module", but Foundry installs under "slow-insert".
// Stage only module contents so tests, tools and Git history never enter the ZIP.
const staging = await mkdtemp(join(tmpdir(), "slow-insert-package-"));
try {
  await cp(source, join(staging, "slow-insert"), { recursive: true });
  const archive = join(staging, "release.zip");
  execFileSync("zip", ["-qr", archive, "slow-insert", "-x", "*/.DS_Store"], { cwd: staging });
  // Keep the existing release intact if staging or zip fails.
  await cp(archive, destination);
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log(fileURLToPath(destination));
