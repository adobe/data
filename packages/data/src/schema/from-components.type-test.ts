// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time type checks for Schema.FromComponents and Schema.FromArchetype.
// Compiled by tsc (not vitest). Each check is isolated in its own function so
// a failure in one does not degrade inference for the others.

import { U32, Vec3 } from "../math/index.js";
import type { Assert } from "../types/assert.js";
import type { Equal } from "../types/equal.js";
import { Schema } from "./index.js";

const components = {
  foo: { type: "string" },
  bar: { type: "number" },
  baz: { type: "boolean" },
} as const;

function fromComponentsWithRequiredTuple() {
  const schema = Schema.FromComponents(
    { a: Vec3.schema, b: U32.schema },
    ["a", "b"],
  );

  type _Type = Assert<Equal<typeof schema.type, "object">>;
  type _Properties = Assert<Equal<
    typeof schema.properties,
    { readonly a: typeof Vec3.schema; readonly b: typeof U32.schema }
  >>;
  type _RequiredIsTuple = Assert<Equal<typeof schema.required, readonly ["a", "b"]>>;
  type _RequiredIsNotUnionArray = Assert<
    Equal<(typeof schema.required)[number], "a" | "b">
  >;
}

function fromComponentsWithoutRequired() {
  const schema = Schema.FromComponents({ a: Vec3.schema, b: U32.schema });

  type _Properties = Assert<Equal<
    typeof schema.properties,
    { readonly a: typeof Vec3.schema; readonly b: typeof U32.schema }
  >>;
  type _RequiredKeys = Assert<
    Equal<(typeof schema.required)[number], "a" | "b">
  >;
}

function fromArchetypePicksComponents() {
  const schema = Schema.FromArchetype(components, ["foo", "baz"]);

  type _Properties = Assert<Equal<
    typeof schema.properties,
    {
      readonly foo: { readonly type: "string" };
      readonly baz: { readonly type: "boolean" };
    }
  >>;
  type _RequiredIsTuple = Assert<Equal<typeof schema.required, readonly ["foo", "baz"]>>;
  type _BarIsExcluded = Assert<
    Equal<"bar" extends keyof typeof schema.properties ? true : false, false>
  >;
}

function fromArchetypeTypeAliasMatchesReturnType() {
  const schema = Schema.FromArchetype(components, ["bar", "foo"]);

  type Expected = Schema.FromArchetype<typeof components, readonly ["bar", "foo"]>;
  type _Alias = Assert<Equal<typeof schema, Expected>>;
}

function fromArchetypeToTypeHasOnlyArchetypeKeys() {
  const schema = Schema.FromArchetype(components, ["foo", "bar"]);
  type T = Schema.ToType<typeof schema>;

  type _ExactKeys = Assert<Equal<keyof T, "foo" | "bar">>;
  type _BazNotPresent = Assert<Equal<"baz" extends keyof T ? true : false, false>>;
  type _ExactShape = Assert<Equal<
    T,
    {
      readonly foo: string;
      readonly bar: number;
    }
  >>;
}

function fromArchetypeToTypeExcludesUnpickedComponents() {
  const schema = Schema.FromArchetype(components, ["foo", "baz"]);
  type T = Schema.ToType<typeof schema>;

  type _BarNotPresent = Assert<Equal<"bar" extends keyof T ? true : false, false>>;
  type _ExactShape = Assert<Equal<
    T,
    {
      readonly foo: string;
      readonly baz: boolean;
    }
  >>;
}

function fromComponentsToTypeMatchesExactComponentMap() {
  const schema = Schema.FromComponents(
    { foo: components.foo, bar: components.bar },
    ["foo", "bar"],
  );
  type T = Schema.ToType<typeof schema>;

  type _ExactKeys = Assert<Equal<keyof T, "foo" | "bar">>;
  type _BazNotPresent = Assert<Equal<"baz" extends keyof T ? true : false, false>>;
  type _ExactShape = Assert<Equal<
    T,
    {
      readonly foo: string;
      readonly bar: number;
    }
  >>;
}

function fromComponentsExtraPropertiesBecomeOptionalInToType() {
  const schema = Schema.FromComponents(components, ["foo", "bar"]);
  type T = Schema.ToType<typeof schema>;

  type _BazIsOptional = Assert<Equal<
    T,
    {
      readonly foo: string;
      readonly bar: number;
      readonly baz?: boolean;
    }
  >>;
  type _BazKeyPresent = Assert<Equal<"baz" extends keyof T ? true : false, true>>;
}

function fromArchetypePreservesArchetypeOrder() {
  const schema = Schema.FromArchetype(components, ["baz", "foo"]);

  type _RequiredOrder = Assert<Equal<typeof schema.required, readonly ["baz", "foo"]>>;
  type _PropertyKeys = Assert<
    Equal<keyof typeof schema.properties, "foo" | "baz">
  >;
  type _BarNotInProperties = Assert<
    Equal<"bar" extends keyof typeof schema.properties ? true : false, false>
  >;
}

