# Systems

A *system* is a declaration and a body, made by `System.create`. The declaration says which entities it runs over;
the build infers from the body what it reads and writes, which orders it against other systems and lets the world run
it in parallel.

- **Row systems** run once per matching entity. [`move`](03-systems.ts#L28-L33) runs over entities with every
  component in `with` and none in `not`, so the `frozen` one stays put. Values are replaced whole, never edited in
  place.
- **Systems without components**, such as [`count`](03-systems.ts#L35-L37), run once per run.
- **Readonly systems**, `readonly: true`, only read. Run one to read the world, as [`read`](03-systems.ts#L40-L42)
  does, or add one to react to it. [Sync points](06-sync-points.md) says when and where they run.
- **Optional components**, `optional: [velocity]`, are in the row where the entity has them and `undefined` where it
  doesn't. They never narrow which entities a system runs on; [`readSpeeds`](03-systems.ts#L44-L47) still reads the
  entity without a velocity. Only commands add and remove them.

A run resolves to what a system without components returns, so [`frameCount`](03-systems.ts#L49) reads a resource
back.

**Failure.** A system whose body throws fails, and its run rejects with an `Error` naming each failed system by its
binding and id. The others' work still applies: [`countThenFail`](03-systems.ts#L54) still counts a frame, as the last
line shows.
