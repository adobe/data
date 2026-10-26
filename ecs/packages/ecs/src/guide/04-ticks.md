# Ticks and cadence

A *tick* is one beat of a world's loop, which runs every system added to it. `world.add(system)` runs a system on
every tick from then on, and [`world.remove`](04-ticks.ts#L41) takes it off.

- `clock` is a resource the world writes on each tick: `delta` is the milliseconds since the last one, `now` the time
  and `tick` the count. [`advance`](04-ticks.ts#L14-L16) accumulates `delta`.
- `cadence` says when ticks happen: once per animation frame by default, or, with `{ kind: "fixed", step }`, every
  `step` milliseconds, each with that `delta`.
- A world ticks only after a run arrives, unless `always` is set, as for [the first world](04-ticks.ts#L36).

An observer with `resources: { changed: [elapsed] }` runs after each tick that changed `elapsed`:
[`watch`](04-ticks.ts#L18-L21) resolves once 30 ms have passed. Once `advance` is removed, `elapsed` stays put.

**Asking for a tick.** A system that needs another tick contributes a time to the `wake` reduction:
`reduce[wake](time)` makes the first tick at or after that time run. [`step`](04-ticks.ts#L25-L28) does it twice, so
the second world, without `always`, ticks three times for one run. Work that one tick's commands start and a later
tick finishes asks for its next tick this way.
