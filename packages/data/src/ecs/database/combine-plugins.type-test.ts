// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Assert } from "../../types/assert.js";
import { Extends } from "../../types/types.js";

/**
 * Type-only test: `Database.Plugin.combine` resolves correctly over a wide
 * single call.
 *
 * `IntersectAll` was reformulated from linear recursion (`Simplify<H & ...>`)
 * to `UnionToIntersection` over the element union, so instantiation depth is
 * now constant regardless of plugin count and the per-level `Simplify`
 * re-materialization is gone (a ~29% instantiation drop on a 24-plugin combine
 * measured locally). This guards that a wide single combine still produces the
 * correct merged plugin type — the buckets from the first and last plugins are
 * both present, and the result builds into a usable database.
 */

const p00 = createPlugin({ components: { c00: { type: "number" } }, archetypes: { A00: ["c00"] } });
const p01 = createPlugin({ components: { c01: { type: "number" } }, archetypes: { A01: ["c01"] } });
const p02 = createPlugin({ components: { c02: { type: "number" } }, archetypes: { A02: ["c02"] } });
const p03 = createPlugin({ components: { c03: { type: "number" } }, archetypes: { A03: ["c03"] } });
const p04 = createPlugin({ components: { c04: { type: "number" } }, archetypes: { A04: ["c04"] } });
const p05 = createPlugin({ components: { c05: { type: "number" } }, archetypes: { A05: ["c05"] } });
const p06 = createPlugin({ components: { c06: { type: "number" } }, archetypes: { A06: ["c06"] } });
const p07 = createPlugin({ components: { c07: { type: "number" } }, archetypes: { A07: ["c07"] } });
const p08 = createPlugin({ components: { c08: { type: "number" } }, archetypes: { A08: ["c08"] } });
const p09 = createPlugin({ components: { c09: { type: "number" } }, archetypes: { A09: ["c09"] } });
const p10 = createPlugin({ components: { c10: { type: "number" } }, archetypes: { A10: ["c10"] } });
const p11 = createPlugin({ components: { c11: { type: "number" } }, archetypes: { A11: ["c11"] } });
const p12 = createPlugin({ components: { c12: { type: "number" } }, archetypes: { A12: ["c12"] } });
const p13 = createPlugin({ components: { c13: { type: "number" } }, archetypes: { A13: ["c13"] } });
const p14 = createPlugin({ components: { c14: { type: "number" } }, archetypes: { A14: ["c14"] } });
const p15 = createPlugin({ components: { c15: { type: "number" } }, archetypes: { A15: ["c15"] } });

const wide = Database.Plugin.combine(
    p00, p01, p02, p03, p04, p05, p06, p07,
    p08, p09, p10, p11, p12, p13, p14, p15,
);

// The intersection resolves: components and archetypes from the first and last
// plugins are both present in the combined plugin type (no cast, no TS2589).
type WideComponents = (typeof wide)["components"];
type WideArchetypes = (typeof wide)["archetypes"];
type CheckFirstComponent = Assert<Extends<WideComponents, { c00: { type: "number" } }>>;
type CheckLastComponent = Assert<Extends<WideComponents, { c15: { type: "number" } }>>;
type CheckFirstArchetype = Assert<Extends<WideArchetypes, { A00: readonly ["c00"] }>>;
type CheckLastArchetype = Assert<Extends<WideArchetypes, { A15: readonly ["c15"] }>>;

// And it is still a usable database: building it and reading the merged
// archetype map type-checks.
const wideDb = Database.create(wide);
type CheckDbArchetypes = Assert<Extends<
    "A00" | "A15",
    keyof (typeof wideDb)["archetypes"]
>>;
void wideDb;
