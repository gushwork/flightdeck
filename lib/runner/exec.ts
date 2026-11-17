import { execFile } from "child_process";

/** Runs a CLI without a shell; rejects with the last stderr line (or a clear message when the binary is missing). */
export function run(cmd: string, args: string[], timeout: number, stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return reject(new Error(`\`${cmd}\` is not installed or not on PATH`));
      reject(new Error(stderr.trim().split("\n").at(-1) || err.message));
    });
    child.stdin?.end(stdin);
  });
}
