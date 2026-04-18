/**
 * Load repo-root `.env` then optional `ansible/playbooks/.env`, then run the Secure Boot CA assessment.
 * Paths in env (e.g. VCENTER_CSV) should be relative to the `ansible/` directory unless absolute.
 *
 * Usage: node tools/run-ansible-assessment.mjs [-- ansible-playbook options]
 * Example: npm run ansible:assess -- -vvv
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const envFiles = [join(root, ".env"), join(root, "ansible", "playbooks", ".env")];
for (let i = 0; i < envFiles.length; i++) {
  const p = envFiles[i];
  if (existsSync(p)) {
    dotenv.config({ path: p, override: i > 0 });
  }
}

const ansibleDir = join(root, "ansible");
const extra = process.argv.slice(2);

const r = spawnSync(
  "ansible-playbook",
  ["playbooks/secureboot_ca_assessment.yml", ...extra],
  {
    cwd: ansibleDir,
    env: process.env,
    stdio: "inherit",
    shell: true,
  }
);

if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
