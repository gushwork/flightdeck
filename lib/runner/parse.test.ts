import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  normalizeResult,
  parseRunnerEvents,
  toIso,
  type RawSnapshot,
  type RawWorkerLog,
} from "./parse";

const EVENTS = [
  "[2026-10-24 12:16:35Z INFO JobDispatcher] Job request 0 for plan plan-a job job-a received.",
  "[2026-10-24 12:16:35Z INFO Terminal] WRITE LINE: 2026-10-24 12:16:35Z: Running job: Dependabot",
  "[2026-10-24 12:18:37Z INFO Terminal] WRITE LINE: 2026-10-24 12:18:37Z: Job Dependabot completed with result: Failed",
  "[2026-10-24 17:13:05Z INFO JobDispatcher] Job request 0 for plan plan-b job job-b received.",
  "[2026-10-24 17:13:05Z INFO Terminal] WRITE LINE: 2026-10-24 17:13:05Z: Running job: build",
  "[2026-10-24 17:17:17Z INFO Terminal] WRITE LINE: 2026-10-24 17:17:17Z: Job build completed with result: Succeeded",
];

function worker(over: Partial<RawWorkerLog>): RawWorkerLog {
  return { file: "Worker_x.log", startedAt: null, endedAt: null, finished: true, ...over };
}

function raw(over: Partial<RawSnapshot>): RawSnapshot {
  return {
    collectedAt: Date.parse("2026-10-24T18:00:00Z"),
    hostname: "github-runner-001",
    vmUptimeSec: 100,
    load: [0.1, 0.2, 0.3],
    memTotal: 16,
    memAvailable: 8,
    diskTotal: 100,
    diskFree: 50,
    runnerName: "github-runner-001",
    runnerUrl: "https://github.com/enterprises/gushwork-ai",
    listener: { pid: 1, elapsedSec: 60 },
    worker: null,
    pm2: null,
    runnerEvents: EVENTS,
    workers: [],
    ...over,
  };
}

describe("toIso / normalizeResult", () => {
  it("treats runner log stamps as UTC", () => {
    expect(toIso("2026-10-24 17:13:05")).toBe("2026-10-24T17:13:05.000Z");
    expect(toIso(null)).toBeNull();
  });

  it("maps runner results", () => {
    expect(normalizeResult("Succeeded")).toBe("success");
    expect(normalizeResult("Failed")).toBe("failure");
    expect(normalizeResult("Canceled")).toBe("cancelled");
    expect(normalizeResult("Weird")).toBe("unknown");
  });
});

describe("parseRunnerEvents", () => {
  it("pairs received → running → completed per plan", () => {
    const events = parseRunnerEvents(EVENTS);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ planId: "plan-a", name: "Dependabot", result: "failure" });
    expect(events[1]).toMatchObject({
      planId: "plan-b",
      name: "build",
      startedAt: "2026-10-24T17:13:05.000Z",
      completedAt: "2026-10-24T17:17:17.000Z",
      result: "success",
    });
  });

  it("leaves an unfinished job without a result", () => {
    const events = parseRunnerEvents(EVENTS.slice(0, 2));
    expect(events[0].result).toBeNull();
    expect(events[0].completedAt).toBeNull();
  });
});

describe("buildSnapshot", () => {
  const workers = [
    worker({ file: "Worker_a.log", planId: "plan-a", repo: "gushwork/gw-argus", name: "Dependabot" }),
    worker({
      file: "Worker_b.log",
      planId: "plan-b",
      repo: "gushwork/flightdeck",
      workflow: "CI",
      runId: "40113906628",
      event: "pull_request",
      version: "2.338.0",
    }),
  ];

  it("joins worker metadata with runner results, newest first", () => {
    const snap = buildSnapshot(raw({ workers }));
    expect(snap.state).toBe("idle");
    expect(snap.runnerVersion).toBe("2.338.0");
    expect(snap.jobs.map((j) => j.id)).toEqual(["plan-b", "plan-a"]);
    expect(snap.jobs[0]).toMatchObject({ repo: "gushwork/flightdeck", result: "success", durationSec: 252 });
    expect(snap.stats).toMatchObject({ total: 2, success: 1, failure: 1, last24h: 2, avgDurationSec: 187 });
  });

  it("reports the in-flight job as running when a worker process exists", () => {
    const inflight = worker({ file: "Worker_c.log", planId: "plan-c", finished: false, startedAt: "2026-10-24 17:59:00", repo: "gushwork/flightdeck" });
    const snap = buildSnapshot(
      raw({
        worker: { pid: 9, elapsedSec: 30 },
        runnerEvents: [
          ...EVENTS,
          "[2026-10-24 17:59:00Z INFO JobDispatcher] Job request 0 for plan plan-c job job-c received.",
          "[2026-10-24 17:59:00Z INFO Terminal] WRITE LINE: 2026-10-24 17:59:00Z: Running job: build",
        ],
        workers: [...workers, inflight],
      }),
    );
    expect(snap.state).toBe("busy");
    expect(snap.currentJob).toMatchObject({ id: "plan-c", result: "running", completedAt: null });
  });

  it("marks a result-less finished worker unknown and keeps events whose worker log is gone", () => {
    const snap = buildSnapshot(
      raw({ runnerEvents: EVENTS.slice(0, 3), workers: [worker({ planId: "plan-z", startedAt: "2026-10-24 10:00:00", endedAt: "2026-10-24 10:01:00" })] }),
    );
    const byId = Object.fromEntries(snap.jobs.map((j) => [j.id, j]));
    expect(byId["plan-z"]).toMatchObject({ result: "unknown", durationSec: 60 });
    expect(byId["plan-a"]).toMatchObject({ result: "failure", repo: null });
  });

  it("is offline when the listener process is gone", () => {
    expect(buildSnapshot(raw({ listener: null })).state).toBe("offline");
  });
});
