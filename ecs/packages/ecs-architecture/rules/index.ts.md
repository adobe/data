---
glob: "**/index.ts"
---
- A component's `index.ts` only re-exports: `export * from "./<kind>.<name>.js"` for each root file, and `export { name } from "./part/index.js"` for what a part passes up.
- Other components import it, never a deep path or a private folder; a part never imports its parent.
