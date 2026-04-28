// © 2026 Adobe. MIT License. See /LICENSE for details.
interface PerfResults {
  memoryKb: number;
  timeMs: number;
  result: any;
  flops: number;
  n: number;
}

declare global {
  interface Performance {
    measureUserAgentSpecificMemory?: () => { bytes: number };
    memory?: { usedJSHeapSize: number };
  }
}

export interface PerformanceTest {
  setup: (n: number) => Promise<void>;
  run: () => any;
  getVisibleEnabledPositions?: () => number[];
  type: "create" | "move";
  cleanup: () => Promise<void>;
}

const typeToFlops = {
  create: 10,
  move: 3 / 4,
} as const satisfies Record<PerformanceTest["type"], number>;

function isPerformanceTest(obj: any): obj is PerformanceTest {
  return (
    typeof obj.setup === "function" &&
    typeof obj.run === "function" &&
    typeof obj.cleanup === "function"
  );
}

function getMemory() {
  //  if in the browser, try to get browser memory usage
  if (typeof window !== "undefined") {
    return performance.memory?.usedJSHeapSize ?? 0;
  }

  return performance.measureUserAgentSpecificMemory?.().bytes ?? 0;
}

function getTime() {
  return performance.now();
}

function garbageCollect() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

export async function runTests(
  testSuites: Record<string, Record<string, PerformanceTest>>,
) {
  console.log("Starting Tests:");
  const allResults: Record<string, Record<string, PerfResults[]>> = {};
  const display = (name: string) => name.replace(/_/g, " ");
  for (const [suite, tests] of Object.entries(testSuites)) {
    console.log(`- ${display(suite)}...`);
    const suiteResults = (allResults[suite] = {} as Record<
      string,
      PerfResults[]
    >);
    for (const [name, test] of Object.entries(tests)) {
      console.log(`  - ${display(name)}...`);
      const testResults: PerfResults[] = [];
      suiteResults[name] = testResults;

      if (test.getVisibleEnabledPositions) {
        if (test.type === "create") {
          throw new Error("Cannot have getVisibleEnabledPositions with create test");
        }
        //  we will run a small n sample of this to verify it works correctly.
        const sample_n = 17;
        await test.setup(sample_n);
        const initialPositions = test.getVisibleEnabledPositions();
        const expectedInitialPositions = [1, 1, 1, 5, 5, 5, 9, 9, 9, 13, 13, 13, 17, 17, 17];
        if (JSON.stringify(initialPositions) !== JSON.stringify(expectedInitialPositions)) {
          console.log(`  Error: invalid initial positions: ${initialPositions}, expected. ${expectedInitialPositions}`);
        }
        // console.log(JSON.stringify(initialPositions));
        //  run the test once to add to visible, enabled particle positions.
        test.run();
        const finalPositions = test.getVisibleEnabledPositions();
        const expectedFinalPositions = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        if (JSON.stringify(finalPositions) !== JSON.stringify(expectedFinalPositions)) {
          console.log(`  Error: invalid final positions: ${finalPositions}, expected. ${expectedFinalPositions}`);
        }
        // console.log(JSON.stringify(finalPositions));
      }

      // Auto-tune n upward so each measured iteration falls in TARGET_BAND.
      // Tests already at or above the lower bound keep their starting n.
      const n = await tuneN(test, 100_000);
      garbageCollect();

      // Warmup so V8 has fully optimized before any sample is recorded.
      const warmupEnd = getTime() + WARMUP_MS;
      while (getTime() < warmupEnd) {
        test.run();
      }
      garbageCollect();

      const baselineMemory = getMemory();
      const timeStart = getTime();

      //   only run for 1 second
      while (getTime() - timeStart < 1000) {
        const result = runOnce(test.run, test);
        result.memoryKb -= baselineMemory;
        testResults.push({...result, flops: n * typeToFlops[test.type], n });
      }

      await test.cleanup();
      garbageCollect();
    }
  }
  // console.log(allResults);
  //  console log some meaningful and readable results for each test that include the min, max and average times
  if (typeof console.table === "function") {
    // Let's use the console table function to layout some nice results that the best results in time and memory
    // are easy to see.
    const tableValues = {} as any;
    for (const [suite, suiteResults] of Object.entries(allResults)) {
      for (const [name, testResults] of Object.entries(suiteResults)) {
        const memoryKb = testResults.map((r) => r.memoryKb / (1024 * 1024));
        const timeMs = testResults.map((r) => r.timeMs);
        const fastestResult = testResults.reduce(
          (a, b) => (a.timeMs < b.timeMs ? a : b)
        );
        const fastestFlopsPerSecond = (fastestResult.flops * 1000) / (fastestResult.timeMs);
        const totalTime = timeMs.reduce((a, b) => a + b, 0);
        const totalFlops = testResults.reduce((a, b) => a + b.flops, 0);
        const averageFlopsPerSecond = (totalFlops * 1000) / totalTime;
        tableValues[`${display(suite)}:${display(name)}`] = {
          N: testResults[0]?.n ?? 0,
          Passes: memoryKb.length,
          // 'Mem Min (Mb)': Math.min(...memoryKb).toFixed(2),
          // 'Mem Max (Mb)': Math.max(...memoryKb).toFixed(2),
          // "Mem Avg (Mb)": (
          //   memoryKb.reduce((a, b) => a + b, 0) / memoryKb.length
          // ).toFixed(2),
          "Time Min (ms)": Math.min(...timeMs).toFixed(2),
          // 'Time Max (ms)': Math.max(...timeMs).toFixed(2),
          "Time Avg (ms)": (
            timeMs.reduce((a, b) => a + b, 0) / timeMs.length
          ).toFixed(2),
          "Fastest MFlops": Math.round(fastestFlopsPerSecond / 1_000_000),
          "Average MFlops": Math.round(averageFlopsPerSecond / 1_000_000),
        };
      }
    }
    console.table(tableValues);
  } else {
    for (const [suite, suiteResults] of Object.entries(allResults)) {
      for (const [name, testResults] of Object.entries(suiteResults)) {
        const memoryKb = testResults.map((r) => r.memoryKb);
        const timeMs = testResults.map((r) => r.timeMs);
        console.log(
          `${name}: ${Math.min(...memoryKb)}kb - ${Math.max(...memoryKb)}kb - ${Math.round(memoryKb.reduce((a, b) => a + b, 0) / memoryKb.length)}kb`
        );
        console.log(
          `${name}: ${Math.round(Math.min(...timeMs))}ms - ${Math.round(Math.max(...timeMs))}ms - ${Math.round(timeMs.reduce((a, b) => a + b, 0) / timeMs.length)}ms`
        );
      }
    }
  }
}

// Browsers without cross-origin isolation clamp performance.now() to ~0.1ms
// resolution, so very fast operations register as 0ms. For move tests we
// inner-loop until the elapsed time exceeds this threshold and report the
// per-iteration average. Create tests are not inner-looped because some
// allocate WASM-backed memory that is not reclaimed between calls.
const MIN_SAMPLE_MS = 2;

// Target per-iteration time band. Tests faster than the lower bound get
// their n scaled up so each call does meaningful work and dominates
// timing-call overhead. Tests slower than the upper bound get their n
// scaled down so we collect enough samples within the 1s budget. Setting
// TARGET_MAX_MS conservatively (250ms) keeps moderate-cost tests
// (ecs1:create at ~65ms, horizon:create at ~200ms) at their original n;
// only pathologically slow tests get down-scaled.
const TARGET_MIN_MS = 0.5;
const TARGET_MAX_MS = 250;
const MIN_AUTO_N = 100;
const MAX_AUTO_N = 1_000_000;
const WARMUP_MS = 50;

async function tuneN(test: PerformanceTest, startN: number): Promise<number> {
  let n = startN;
  for (let attempt = 0; attempt < 4; attempt++) {
    await test.setup(n);
    const probe = runOnce(test.run, test);
    const probeMs = Math.max(probe.timeMs, 0.001);
    if (probeMs >= TARGET_MIN_MS && probeMs <= TARGET_MAX_MS) {
      return n;
    }
    const target = (TARGET_MIN_MS + TARGET_MAX_MS) / 2;
    const ratio = target / probeMs;
    const scaled = Math.round(n * ratio);
    const newN = Math.max(MIN_AUTO_N, Math.min(MAX_AUTO_N, scaled));
    if (newN === n) {
      return n;
    }
    await test.cleanup();
    n = newN;
  }
  return n;
}

function runOnce(fn: () => any, test: PerformanceTest): Omit<PerfResults, "flops" | "n"> {
  const start = getTime();
  let result: any;
  let iterations = 0;
  let now = start;
  if (test.type === "move") {
    do {
      result = fn();
      iterations++;
      now = getTime();
    } while (now - start < MIN_SAMPLE_MS);
  } else {
    result = fn();
    iterations = 1;
    now = getTime();
  }
  const after = getMemory();
  const timeMs = (now - start) / iterations;
  return { memoryKb: after, timeMs, result };
}
