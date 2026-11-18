# ports

Measures the suite's benchmarks on the machine. `entry.node.ts` runs one benchmark in node (`scripts/ours.mjs` runs
the build of it, `dist/main/node.js`), and `entry.browser.ts` runs one in a page (`browser.html`, which
`scripts/gpu.mjs` opens). Both use the private `scenarios`, each benchmark timed as an app pays for it; `laneWorld`, a
world for a lane (JS, WASM, threads or GPU); and `compareLanes`, which runs the GPU frames on two worlds and reports
how what they hold differs. The layer exports nothing.
