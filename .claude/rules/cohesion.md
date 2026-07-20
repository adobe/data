---
paths:
  - 'packages/**/*.ts'
  - 'packages/**/*.tsx'
---

# Cohesion — make related code share a name

Code that serves one purpose should be reachable through one name.
Cohesion that exists only in the reader's head is a smell — make it
visible by extracting a function, a hook, or a folder.

## Within a file (statement cohesion)

When adjacent statements share a single purpose — same dependencies,
same lifetime, same conceptual job — collapse them behind one named
local helper. The surrounding scope should read at one level of
abstraction; the lower-level mechanics live inside the helper.

This is *Composed Method* / *SLAP*. The fix is local: a private
function or local hook in the same file, no public API, no claim of
reusability. Naming makes the cohesion structural instead of leaving
it for the reader to assemble.

```ts
// Smell: two statements that are one concept ("owned controller")
const controller = useMemo(() => createController(svc, cfg), [svc, cfg]);
useEffect(() => () => controller.dispose(), [controller]);

// Fix: cohesion has a name
const controller = useDisposableController(svc, cfg);
```

## Across files (folder cohesion)

One public export per file. Private declarations inside the file are
fine — they are implementation detail and are tested indirectly
through the public export. Only the public export gets a sibling
`*.test.ts`.

**Exception: barrels.** An `index.ts` (and a namespace's `public.ts`)
exists precisely to re-export a folder's public surface, so it carries
many exports. That is the barrel's whole job — it declares nothing of its
own, only `export … from "./…"`. The one-export rule governs files that
*declare*, not files that *re-export*.

When a public file wants *helper sibling files*, promote the cluster
into a folder named after the concept. Helpers never sit at peer
level with unrelated public files; the folder is the new boundary.

```
ok                  smell                       fix
foo.ts              foo.ts                      foo/
foo.test.ts         foo-helper.ts                 foo.ts
bar.ts              foo.test.ts                   foo-helper.ts
bar.test.ts         bar.ts                        foo.test.ts
                    bar.test.ts                 bar.ts
                                                bar.test.ts
```

## Heuristic

For any pair of symbols — two statements, two files — ask: "is their
relationship visible in the structure, or only in the reader's
head?" If the latter, give the cohesion a name: a function, a hook,
or a folder.
