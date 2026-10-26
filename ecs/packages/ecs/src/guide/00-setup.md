# Setup

Install `@adobe/ecs` and add its build plugin to Vite:

```ts
import { Compiler } from "@adobe/ecs/compiler";
export default defineConfig({ plugins: [Compiler.plugin()] });
```

The plugin is part of the API, not an optimization. It reads each system's body to infer what the body reads and
writes, compiles kernels, reads the schema of each value from its declared type, and gives every key and system an id.

- A library builds with `Compiler.plugin({ library: true })`, so its build ships the registrations its declarations
  give.
- Kernels run on workers loaded as separate chunks, so the plugin sets Vite's `worker.format` to `"es"` unless the
  config sets it.

Components and resources are keys, each declared once with its type: [Keys and declarations](00-keys.md).

**Systems** declare only what their body can't show: the entities they run over, their change filters and
conditions, and their order. Write the body inline in `System.create`, indexing rows and resources by key, so the
plugin can read it.

Each chapter's example is a program whose `main` creates worlds, runs systems on them and logs what they did.
