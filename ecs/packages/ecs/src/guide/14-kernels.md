# Kernels

A *kernel* is a body the build compiles to run once per row, each row on its own, so the world can split the rows
across workers and run them as WASM, with results the same as the body as written.

The build makes a kernel of any row system whose body reads and writes only data, calls math, and touches no module
state, without being asked: [`move`](14-kernels.ts#L18-L21) is one. Two flags change that:

- `kernel: true` asserts it. The build fails, saying why, if [the body](14-kernels.ts#L23-L25) can't be one. It also
  computes `F32` values at 32 bits, which is faster on dense rows.
- `kernel: false` runs [the body as written](14-kernels.ts#L27-L29), on its thread: to step through it in a
  debugger, say.

In the guide, the lens above each system says what it compiles to: JS, WASM and WGSL, or as written. Its Compiled tab
shows the code.
