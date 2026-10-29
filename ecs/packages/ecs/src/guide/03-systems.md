# Systems

A *system* is a declaration and a body, made by `System.create`. The declaration says which entities it runs over;
the build infers from the body what it reads and writes, which orders it against other systems and lets the world run
it in parallel.

- **Row systems** run once per matching entity. [`move`](03-systems.ts#L28-L33) runs over entities with every
  component in `with` and none in `not`, so the `frozen` one stays put. Values are replaced whole, never edited in
  place.
- **Systems without components**, such as [`count`](03-systems.ts#L35-L37), run once per run.
- **Optional components**, `optional: [velocity]`, are in the row where the entity has them and `undefined` where it
  doesn't. They never narrow which entities a system runs on; [`readSpeeds`](03-systems.ts#L44-L47) still reads the
  entity without a velocity. Only commands add and remove them.

A run resolves to what a system without components returns, so [`frameCount`](03-systems.ts#L49) reads a resource
back.

**Readonly systems.** `readonly: true` changes when and where a system runs, and what it may do. Run one to read the
world, as [`read`](03-systems.ts#L40-L42) does, or add one to react to it.

- **When:** after the run's sync point, so it sees what the run's commands did. In [`frame`](03-systems.ts#L63),
  [`look`](03-systems.ts#L60-L62) counts the entity `addOne` spawns. [`peek`](03-systems.ts#L56-L58) only reads too,
  but isn't readonly: it runs in its tier, before the sync point, and counts one fewer.
- **Where:** on the thread that added or ran it, so a [joined thread](19-threads.md) adds only readonly systems.
- **Order:** none. A readonly system can't declare `before`, `after` or `during`; `peek` declares `after: [addOne]`.
- **Limits:** it can't write, use `commands` or `reduce`, or take input. Its row and resources are read-only, so
  each is a type error.

**Failure.** A system whose body throws fails, and its run rejects with an `Error` naming each failed system by its
binding and id. The others' work still applies: [`countThenFail`](03-systems.ts#L68) still counts a frame, as the last
line shows.
