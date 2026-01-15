// © 2026 Adobe. MIT License. See /LICENSE for details.
interface PerfResults {
  memoryKb: number;
  timeMs: number;
  result: any;
  flops: number;
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

      const n = test.getVisibleEnabledPositions ? 100_000 : 100_000;

      await test.setup(n);
      garbageCollect();

      const baselineMemory = getMemory();
      const timeStart = getTime();

      //   only run for 1 second
      while (getTime() - timeStart < 100) {
        const result = runOnce(test.run, test);
        result.memoryKb -= baselineMemory;
        testResults.push({...result, flops: n * typeToFlops[test.type] });
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

function runOnce(fn: () => any, test: PerformanceTest): Omit<PerfResults, "flops"> {
  const start = getTime();
  const result = fn();
  const end = getTime();
  const after = getMemory();
  const timeMs = end - start;
  return { memoryKb: after, timeMs, result };
}
