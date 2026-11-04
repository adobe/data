---
glob: "**/constant.systems.ts"
---
- Declare `export const systems: readonly System[] = [...]`: the layer's systems the world adds, empty if none, and each part's spread in: `import { systems as part } from "./part/index.js"`, then `...part`.
- An app adds the `systems` of every layer it uses, and those of the layers they depend on.
