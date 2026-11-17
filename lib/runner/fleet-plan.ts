/**
 * Pure helpers for creating and killing runner VMs: validation, naming, GitHub scope URLs,
 * runner release parsing and the first-boot script. Client-safe; `az`/GitHub calls live in `fleet.ts`.
 */
import type { CreateRunnerVmInput, GhRunnerInfo, RunnerVm } from "./types";

/** Azure Linux VM names double as hostnames and runner names: lowercase letters, digits, dashes. */
export const VM_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const VM_SIZE_RE = /^Standard_[A-Za-z0-9_]{2,40}$/;
export const LABEL_RE = /^[A-Za-z0-9._-]{1,64}$/;
export const SCOPE_RE = /^(enterprises\/[A-Za-z0-9-]+|orgs\/[A-Za-z0-9-]+|repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+)$/;
const MAX_LABELS = 20;

/** GitHub-hosted runner labels. A self-hosted runner carrying one can take jobs meant for GitHub's machines. */
const HOSTED_LABEL_RE = /^(ubuntu|windows|macos)-(latest|\d+(\.\d+)?)(-(arm|arm64|large|xlarge|xl))?$|^ubuntu-slim$/i;

export function scopeError(scope: string | undefined): string | null {
  if (scope === undefined || SCOPE_RE.test(scope)) return null;
  return "Scope must look like enterprises/<slug>, orgs/<org> or repos/<owner>/<repo>.";
}

/** Runner `.runner` URL (`https://github.com/enterprises/x`, `/org`, `/owner/repo`) → API scope. */
export function scopeFromRunnerUrl(url: string | null | undefined): string | null {
  const m = url ? /^https:\/\/github\.com\/([^?#]+?)\/?$/.exec(url.trim()) : null;
  if (!m) return null;
  const parts = m[1].split("/");
  const scope =
    parts[0] === "enterprises" && parts.length === 2
      ? `enterprises/${parts[1]}`
      : parts.length === 1
        ? `orgs/${parts[0]}`
        : parts.length === 2
          ? `repos/${parts[0]}/${parts[1]}`
          : null;
  return scope && SCOPE_RE.test(scope) ? scope : null;
}

/** API scope → the URL `config.sh --url` expects. */
export function registrationUrl(scope: string): string {
  const [kind, ...rest] = scope.split("/");
  return kind === "enterprises" ? `https://github.com/${scope}` : `https://github.com/${rest.join("/")}`;
}

export function parseLabels(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((l) => l.trim()).filter(Boolean))];
}

export function hostedLabels(labels: string[]): string[] {
  return labels.filter((l) => HOSTED_LABEL_RE.test(l));
}

/** Next free name after the template's numeric suffix: github-runner-001 → github-runner-002. */
export function nextRunnerName(template: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const m = /^(.*?)(\d+)$/.exec(template);
  const prefix = m ? m[1] : `${template}-`;
  const width = m ? m[2].length : 1;
  let n = Math.max(
    m ? Number(m[2]) : 1,
    ...[...used].map((name) => (name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)) ? Number(name.slice(prefix.length)) : 0)),
  );
  let name: string;
  do {
    n += 1;
    name = `${prefix}${String(n).padStart(width, "0")}`;
  } while (used.has(name));
  return name;
}

/** Problems with a create request; empty when it can go ahead. */
export function createInputErrors(input: CreateRunnerVmInput, taken: string[]): string[] {
  const errors: string[] = [];
  if (!VM_NAME_RE.test(input.name)) errors.push("Name: lowercase letters, digits and dashes, up to 64 characters.");
  if (taken.some((n) => n.toLowerCase() === input.name)) errors.push(`A VM or runner named ${input.name} already exists.`);
  if (!VM_SIZE_RE.test(input.size)) errors.push("Size must be an Azure size such as Standard_D4ads_v7.");
  if (input.labels.length > MAX_LABELS) errors.push(`At most ${MAX_LABELS} labels.`);
  const bad = input.labels.filter((l) => !LABEL_RE.test(l));
  if (bad.length) errors.push(`Invalid labels: ${bad.join(", ")} (letters, digits, dots, dashes, underscores).`);
  return errors;
}

export interface RunnerRelease {
  version: string;
  url: string;
  sha256: string;
}

/** Latest `actions/runner` release → tarball URL and its published SHA-256 for this architecture. */
export function parseRunnerRelease(
  release: { tag_name?: string; body?: string | null; assets?: { name: string; browser_download_url: string }[] },
  arch: "x64" | "arm64",
): RunnerRelease {
  const version = (release.tag_name ?? "").replace(/^v/, "");
  const asset = release.assets?.find((a) => a.name === `actions-runner-linux-${arch}-${version}.tar.gz`);
  const sha = new RegExp(`<!-- BEGIN SHA linux-${arch} -->([0-9a-f]{64})<!-- END SHA linux-${arch} -->`).exec(release.body ?? "");
  if (!version || !asset || !sha) throw new Error(`Could not find the linux-${arch} runner tarball and checksum in the latest actions/runner release.`);
  return { version, url: asset.browser_download_url, sha256: sha[1] };
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export interface BootstrapParams {
  user: string;
  release: RunnerRelease;
  registrationUrl: string;
  /** Registration token: single-use for config.sh, expires one hour after it is minted. */
  token: string;
  name: string;
  labels: string[];
}

/**
 * First-boot script (cloud-init user data, runs once as root): Docker (Dependabot jobs need it),
 * the runner checked against its published SHA-256, registration, and a systemd service.
 */
export function bootstrapScript(p: BootstrapParams): string {
  const dir = `/home/${p.user}/actions-runner`;
  const config = [
    "./config.sh --unattended --replace",
    `--url ${shq(p.registrationUrl)}`,
    `--token ${shq(p.token)}`,
    `--name ${shq(p.name)}`,
    ...(p.labels.length ? [`--labels ${shq(p.labels.join(","))}`] : []),
  ].join(" ");
  return `#!/bin/bash
# Written by Flightdeck. Runs once on first boot; output goes to /var/log/flightdeck-runner-bootstrap.log.
set -euo pipefail
exec >>/var/log/flightdeck-runner-bootstrap.log 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io git jq curl unzip build-essential
systemctl enable --now docker
id -u ${shq(p.user)} >/dev/null 2>&1 || useradd -m -s /bin/bash ${shq(p.user)}
usermod -aG docker ${shq(p.user)}
install -d -o ${shq(p.user)} -g ${shq(p.user)} ${shq(dir)}
cd ${shq(dir)}
curl -fsSL -o runner.tar.gz ${shq(p.release.url)}
echo ${shq(`${p.release.sha256}  runner.tar.gz`)} | sha256sum -c -
tar xzf runner.tar.gz
rm runner.tar.gz
./bin/installdependencies.sh
chown -R ${shq(`${p.user}:${p.user}`)} ${shq(dir)}
sudo -u ${shq(p.user)} ${config}
./svc.sh install ${shq(p.user)}
./svc.sh start
`;
}

/** Runner registrations with no VM of the same name (leftovers from deleted machines). */
export function orphanRunners(vms: Pick<RunnerVm, "name">[], runners: GhRunnerInfo[]): GhRunnerInfo[] {
  const names = new Set(vms.map((v) => v.name.toLowerCase()));
  return runners.filter((r) => !names.has(r.name.toLowerCase()));
}
