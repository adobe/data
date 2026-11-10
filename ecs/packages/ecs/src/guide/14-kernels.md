# Kernels

A *kernel* is a body the build compiles to run once per row, each row on its own, so the world can split the rows
across workers and run them as WASM, with results the same as the body as written.

The build makes a kernel of any row system whose body reads and writes only data, calls math, and touches no module
state, without being asked: [`move`](14-kernels.ts#L21-L23) is one. Two flags change that:

- `kernel: true` asserts it. The build fails, saying why, if [the body](14-kernels.ts#L25-L27) can't be one. It also
  computes `F32` values at 32 bits, which is faster on dense rows.
- `kernel: false` runs [the body as written](14-kernels.ts#L29-L31), on its thread: to step through it in a
  debugger, say.

A resource can be a *typed array* of a fixed length, `{ type: Uint8Array; length: 8 }`, each world's its own,
starting as zeros. [`mark`](14-kernels.ts#L34-L36) writes its elements in place, `resources[trail][x] = 1`, as kernels
do on every thread and on the GPU:

- An index that isn't one of its elements reads `undefined` and writes nothing, and a store converts as the array does.
- A run that writes an element counts the array changed. Of two rows writing one element, which writes it last isn't
  specified.
- Systems read it in place; anything else reading the resource gets a copy.

In the guide, the lens above each system says what it compiles to: JS, WASM and WGSL, or as written. Its Compiled tab
shows the code.
