---
applyTo: "**/index.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- A component's `index.ts` only re-exports: `export * from "./<kind>.<name>.js"` for each root file, and `export { name } from "./part/index.js"` for what a part passes up.
- Other components import it, never a deep path or a private folder; a part never imports its parent.
