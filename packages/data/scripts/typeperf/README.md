# Plugin composition — type-checker complexity ruler

An objective, reproducible measurement of how `Database.Plugin` composition
scales the TypeScript type-checker's workload as plugin chains get deeper.

## Why

`Database.Plugin.create({ extends })` re-exports **all** of an ancestor
plugin's types into the result type. Every downstream signature then
re-instantiates the full accumulated 9-bucket intersection
(`XP['components'] & CS`, … ×9) plus `Store<FromSchemas<all-components>>`
embedded in every transaction/action/system. The cost compounds down the
chain — deep chains hit TS7056 and force `db: any`
(see `src/ecs/database/deep-extends-chain.type-test.ts`).

This harness quantifies that cost so changes to the composition API can be
judged against a number instead of a feeling.

## How to run

```sh
node scripts/typeperf/measure.mjs                 # extends only (baseline)
node scripts/typeperf/measure.mjs extends imports # compare both modes
```

It generates a synthetic linear chain at depths `[2,4,8,16,24,32]`. Each link
adds 3 components / 2 resources / 4 transactions — roughly one real production
plugin — and `extends` (or `imports`) the previous link. The
tail forces full resolution (`Database.create` + transaction calls) and
declaration emit (exported `create()`), the path that trips TS7056.

The imported-graph cost (`tsc` checking the package source the chain pulls in)
is constant across depths, so growth in the table is attributable to the
composition property under test.

## Metric

**Instantiations** is the headline number — it counts re-evaluation of generic
machinery, exactly what re-export amplifies. Read the curve, not the absolute:

- **Flat per-link marginal** (Instantiations grows linearly in depth) = healthy.
- **Rising per-link marginal** (`inst/depth²` roughly flat) = super-linear ≈ quadratic.

`Types` growing while `Instantiations` stays flat would mean "more distinct
types but cheap" — fine. The pathology is the reverse: `Types` ~linear but
`Instantiations` quadratic, i.e. the same machinery re-evaluated over and over.

## Baseline (`extends`, TS 5.8.3)

| depth | Types | Instantiations | Check | inst/depth² |
|------:|------:|---------------:|------:|------------:|
| 2  | 34,600 | 121,465 | 0.94s | 30,366 |
| 4  | 34,890 | 136,418 | 0.94s | 8,526 |
| 8  | 35,470 | 198,856 | 1.03s | 3,107 |
| 16 | 36,630 | 558,692 | 1.03s | 2,182 |
| 24 | 37,790 | 1,487,808 | 1.20s | 2,583 |
| 32 | 38,950 | 3,379,420 | 1.49s | 3,300 |

`inst/depth²` is roughly flat from depth 8 up → growth is ≈ quadratic.
`Types` grows only linearly → the cost is repeated re-instantiation, not
distinct types. A deep production plugin chain (~10–15 links) sits at
the knee.

## Result — `imports` vs `extends`

`imports` makes ancestor types visible to local declarations **without**
re-exporting them into the result type. Each link's result stays
`O(local members)`, so the chain becomes **linear**; consumers compose the
union once via `Database.Plugin.combine(...)`. Measured (TS 5.8.3,
`node scripts/typeperf/measure.mjs extends imports`):

| depth | extends (inst) | imports (inst) | speedup |
|------:|---------------:|---------------:|--------:|
| 2  | 126,711 | 128,480 | 1.0× |
| 4  | 143,520 | 140,417 | 1.0× |
| 8  | 209,670 | 168,783 | 1.2× |
| 16 | 576,930 | 243,419 | 2.4× |
| 24 | 1,513,470 | 341,927 | 4.4× |
| 32 | 3,412,506 | **387,379** | **8.8×** |

Marginal instantiations per link — `extends` climbs (8K → 237K, super-linear);
`imports` stays flat (6K → 12K, linear). `extends`'s own numbers are within
~1% of the pre-`imports` baseline above (the `& IP['x']` intersections reduce
to `& {}` when `imports` is unused), so the additive property costs the
existing path nothing.

### Caveat on realism

The generated `imports` chain has each link import only its immediate
predecessor (whose result is local-only), then the tail composes the full
union via `combine`. This is the cheapest shape. A plugin that needs to *see*
several ancestors imports a combined context
(`imports: Database.Plugin.combine(a, b, c)`); that intersection is paid once
per import site over local-only (O(1)) operands, so the total stays linear in
total members as long as authors keep result types local — which `imports`
enforces by construction.
</content>
