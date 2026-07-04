# @adobe/data-gpu

WebGPU ECS plugins for graphics, physics, and materials. Built on `@adobe/data`.

## Package exports

The package uses **subpath exports** so bundlers tree-shake unused domains (e.g. a graphics-only app never pulls in Rapier/Jolt WASM).

| Import path | Contents |
| --- | --- |
| `@adobe/data-gpu` | Core only — `core` plugin, `FrameTime` |
| `@adobe/data-gpu/graphics` | Scene graph, camera, orbit, PBR render, mesh/shape, skinning, picking |
| `@adobe/data-gpu/physics` | `physicsData`, body/joint types, `joltSolver`, `rapierSolver`, ragdoll helpers |
| `@adobe/data-gpu/material` | Material palette, `requireMaterial`, standard material definitions |

```ts
import { core } from "@adobe/data-gpu";
import { Orbit, pbrIblRender, shapeGeometry } from "@adobe/data-gpu/graphics";
import { joltSolver, physicsData } from "@adobe/data-gpu/physics";
import { Material, requireMaterial } from "@adobe/data-gpu/material";
```

Solvers are opt-in: import only the solver you use. With `sideEffects: false`, unused solver WASM is tree-shaken out.

## Build

```bash
pnpm --filter @adobe/data-gpu build
```

Samples live in `data-gpu-samples` (port 3008). See `CLAUDE.md` in this package for ECS performance conventions.

## Further reading

- `src/physics/README.md` — physics feature roadmap
- `src/physics/solvers/README.md` — choosing Jolt vs Rapier
