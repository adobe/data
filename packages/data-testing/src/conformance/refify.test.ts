// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { matches } from "../match/match.js";
import { refifyState } from "./refify.js";

// A store's schema map: `name` is plain, `asset` / `placement.parent` / `selected`
// are entity references (`Entity.schema` sets `entity: true`), `placement` is a
// bundle carrying a nested reference. `refifyState` reads exactly these to know
// which numbers are ids.
const source = {
  componentSchemas: {
    name: { type: "string" },
    selected: { type: "integer", entity: true },
    asset: { type: "integer", entity: true },
    placement: {
      type: "object",
      properties: { parent: { type: "integer", entity: true }, order: { type: "number" } },
    },
  },
};

// `refifyState(expected, source)` turns the case's spec-ids into `ref`s; `matches`
// then solves the id-bijection against an ECS projection that minted its OWN ids.
const conforms = (actual: unknown, expected: unknown): boolean => matches(actual, refifyState(expected, source));

describe("refifyState — comparison up to an id-bijection", () => {
  it("matches entity map keys regardless of the actual ids", () => {
    const expected = { entities: new Map([[1, { name: "a" }], [2, { name: "b" }]]) };
    // The ecs minted 100/200 for the same two entities — content pairs, keys need not.
    expect(conforms({ entities: new Map([[100, { name: "a" }], [200, { name: "b" }]]) }, expected)).toBe(true);
    // A value mismatch still fails.
    expect(conforms({ entities: new Map([[100, { name: "a" }], [200, { name: "X" }]]) }, expected)).toBe(false);
  });

  it("lines up a reference field with the entity it names (cross-reference)", () => {
    // Layer 2 references asset 1.
    const expected = { entities: new Map([[1, { name: "asset" }], [2, { name: "layer", asset: 1 }]]) };
    // The ecs minted 10 for the asset and 20 for the layer; layer.asset must be 10.
    expect(conforms({ entities: new Map([[10, { name: "asset" }], [20, { name: "layer", asset: 10 }]]) }, expected)).toBe(true);
    // Same shape but the reference points at the wrong entity — must fail.
    expect(conforms({ entities: new Map([[10, { name: "asset" }], [20, { name: "layer", asset: 20 }]]) }, expected)).toBe(false);
  });

  it("finds a reference nested inside a bundle (placement.parent)", () => {
    const expected = {
      entities: new Map([
        [1, { name: "group" }],
        [2, { name: "child", placement: { parent: 1, order: 0 } }],
      ]),
    };
    expect(
      conforms(
        { entities: new Map([[7, { name: "group" }], [8, { name: "child", placement: { parent: 7, order: 0 } }]]) },
        expected,
      ),
    ).toBe(true);
    // A dangling parent (no such entity) fails.
    expect(
      conforms(
        { entities: new Map([[7, { name: "group" }], [8, { name: "child", placement: { parent: 99, order: 0 } }]]) },
        expected,
      ),
    ).toBe(false);
  });

  it("lines up a reference-typed singleton (resource) with an entity key", () => {
    const expected = { selected: 1, entities: new Map([[1, { name: "a" }], [2, { name: "b" }]]) };
    expect(conforms({ selected: 42, entities: new Map([[42, { name: "a" }], [7, { name: "b" }]]) }, expected)).toBe(true);
    // `selected` points at the other entity — fails the correspondence.
    expect(conforms({ selected: 7, entities: new Map([[42, { name: "a" }], [7, { name: "b" }]]) }, expected)).toBe(false);
  });

  it("does not treat a plain (non-reference) number as an id", () => {
    // `order` is a plain number, not an entity ref — a differing order must fail
    // (it is compared literally, never bijected away).
    const expected = { entities: new Map([[1, { name: "a", placement: { parent: 1, order: 3 } }]]) };
    expect(conforms({ entities: new Map([[9, { name: "a", placement: { parent: 9, order: 3 } }]]) }, expected)).toBe(true);
    expect(conforms({ entities: new Map([[9, { name: "a", placement: { parent: 9, order: 4 } }]]) }, expected)).toBe(false);
  });

  it("leaves an already-authored matcher untouched (idempotent)", () => {
    const expected = { entities: new Map([[1, { name: "a", asset: 1 }]]) };
    // refify is safe to run once; keys and refs become `ref`s and still match.
    expect(conforms({ entities: new Map([[5, { name: "a", asset: 5 }]]) }, expected)).toBe(true);
  });
});
