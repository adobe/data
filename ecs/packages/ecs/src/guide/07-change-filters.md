# Change filters and conditions

A *change filter* skips work that has nothing new to do.

- **A resource** in `resources: { changed: [level] }` passes the system's first run and each run after the resource
  changed. [`load`](07-change-filters.ts#L26-L29) spawns once, with no run-once flag: the second run is skipped.
- **A component** in `components: { changed: [score] }` passes only rows whose value may have changed since this
  system last ran. [`show`](07-change-filters.ts#L30-L33) shows every score on its first run, then only the boss's,
  which [`bump`](07-change-filters.ts#L34-L36) wrote. `added` passes rows whose components were added since then.

A *condition* runs a system only while resources hold. With `resources: { is: [map], not: [paused] }`,
[`step`](07-change-filters.ts#L43-L45) runs only while `map` is neither `null` nor `false` and `paused` is. In the
body, `is` narrows the type: `resources[map]` isn't `null`. A system without components that a filter or a condition
skips resolves to `undefined`.
