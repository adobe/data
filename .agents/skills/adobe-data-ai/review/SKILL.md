---
name: review
description: Review built feature/application output against the @adobe/data feature rules; report whether it is optimal and where any fix belongs. Read-only.
input: a path to built output (a layer, a feature, or a whole app)
output: a review — OPTIMAL, or a list of issues each tagged code | skill | rule
---

Read the files under the given path and assess them against the relevant `features/`
rules (each layer's rule and the cross-cutting rules — `namespace`, `data-modelling`,
`type-casts`, `cohesion`, …):

- **Correctness** — does it typecheck and follow the layer's required shape?
- **Adherence** — single public export per file, naming, the scope helpers
  (`Database.components` / `resources` / `archetypes`), `satisfies` targets, barrels,
  store-layer typing, etc.
- **Generality** — no leaked type identities; follows the cross-cutting patterns.

Report either **OPTIMAL**, or a short list of issues. Tag each issue with where the
root-cause fix belongs:

- `code` — a one-off slip in the generated files (guidance is fine),
- `skill` — the phase skill's instructions are unclear, wrong, or incomplete,
- `rule` — a referenced rule is unclear, wrong, or missing guidance.

Do not edit anything — assessment only.
