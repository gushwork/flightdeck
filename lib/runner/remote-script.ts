/**
 * Python 3 snapshot script run on the runner VM over `ssh … python3 -`.
 * Prints one JSON document (see `RawSnapshot` in `parse.ts`). Read-only: it only
 * reads /proc, `~/actions-runner/_diag/*.log`, `.runner`, and `ps` / `pm2 jlist` output.
 */
export const REMOTE_SNAPSHOT_SCRIPT = String.raw`import glob, json, os, re, subprocess, sys, time

ROOT = os.path.expanduser("~/actions-runner")
DIAG = os.path.join(ROOT, "_diag")
TS = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)Z ")


def sh(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return ""


def read(path):
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def procs(pattern):
    for line in sh("ps -eo pid=,etimes=,args=").splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and re.search(pattern, parts[2]) and "grep" not in parts[2]:
            return {"pid": int(parts[0]), "elapsedSec": int(parts[1])}
    return None


def pm2_proc():
    try:
        for p in json.loads(sh("pm2 jlist 2>/dev/null")):
            env = p.get("pm2_env", {})
            return {
                "name": p.get("name"),
                "status": env.get("status"),
                "restarts": env.get("restart_time"),
                "uptimeMs": int(time.time() * 1000) - env["pm_uptime"] if env.get("pm_uptime") else None,
            }
    except Exception:
        pass
    return None


def worker_record(path):
    text = read(path)
    lines = text.splitlines()
    stamps = [m.group(1) for m in (TS.match(l) for l in lines) if m]
    rec = {
        "file": os.path.basename(path),
        "startedAt": stamps[0] if stamps else None,
        "endedAt": stamps[-1] if stamps else None,
        "finished": "Job completed." in text,
        "version": (re.search(r"Worker\] Version: (\S+)", text) or [None, None])[1],
    }
    marker = text.find("Job message:")
    brace = text.find("{", marker) if marker >= 0 else -1
    if brace < 0:
        return rec
    try:
        msg, _ = json.JSONDecoder().raw_decode(text[brace:])
    except ValueError:
        return rec
    gh = {}
    for item in ((msg.get("contextData") or {}).get("github") or {}).get("d", []):
        if isinstance(item.get("v"), str):
            gh[item["k"]] = item["v"]
    rec.update(
        planId=(msg.get("plan") or {}).get("planId"),
        jobId=msg.get("jobId"),
        name=msg.get("jobDisplayName"),
        repo=gh.get("repository"),
        workflow=gh.get("workflow"),
        runId=gh.get("run_id"),
        runNumber=gh.get("run_number"),
        runAttempt=gh.get("run_attempt"),
        event=gh.get("event_name"),
        ref=gh.get("ref"),
        sha=gh.get("sha"),
        actor=gh.get("actor"),
    )
    return rec


def runner_events():
    keep = re.compile(r"Job request 0 for plan|Terminal\] WRITE LINE: .*(Running job|completed with result|Listening for Jobs)")
    out = []
    for path in sorted(glob.glob(os.path.join(DIAG, "Runner_*.log"))):
        out += [l for l in read(path).splitlines() if keep.search(l)]
    return out[-3000:]


mem = {}
for line in read("/proc/meminfo").splitlines():
    k, _, v = line.partition(":")
    mem[k] = int(v.split()[0]) * 1024 if v.split() else 0
disk = os.statvfs("/")
config = {}
try:
    config = json.loads(read(os.path.join(ROOT, ".runner")))
except ValueError:
    pass

workers = sorted(glob.glob(os.path.join(DIAG, "Worker_*.log")))[-60:]
print(json.dumps({
    "collectedAt": int(time.time() * 1000),
    "hostname": sh("hostname").strip(),
    "vmUptimeSec": int(float(read("/proc/uptime").split()[0] or 0)),
    "load": [float(x) for x in read("/proc/loadavg").split()[:3]],
    "memTotal": mem.get("MemTotal"),
    "memAvailable": mem.get("MemAvailable"),
    "diskTotal": disk.f_blocks * disk.f_frsize,
    "diskFree": disk.f_bavail * disk.f_frsize,
    "runnerName": config.get("agentName"),
    "runnerUrl": config.get("gitHubUrl"),
    "listener": procs(r"Runner\.Listener run"),
    "worker": procs(r"Runner\.Worker"),
    "pm2": pm2_proc(),
    "runnerEvents": runner_events(),
    "workers": [worker_record(p) for p in workers],
}))
`;
