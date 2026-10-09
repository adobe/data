// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { State } from "./state.js";

/**
 * Observes every `Observe` member of a service — found by recursively walking its
 * schema, through nested organizational groups — in parallel, and emits them combined
 * into one object with the service's nested shape (`foo.state.b` is read as
 * `state.foo.state.b`). Like `Observe.fromProperties`, nothing is emitted until every
 * member has a value, then once per change. When the service's schema changes, the
 * member set is re-derived.
 *
 * Every observe member the schema describes is included, regardless of its `external`
 * policy; members the schema describes but the instance lacks (optional) are skipped.
 */
export function toObserveState<T extends Service & { readonly schema: Observe<Schema> }>(service: T): Observe<State<T>> {
  return Observe.withUnwrap(Observe.withMap(service.schema, (schema) => observeState(service, schema)));
}

function observeState<T extends Service>(service: T, schema: Schema): Observe<State<T>> {
  const paths: (readonly string[])[] = [];
  const members: Record<string, Observe<unknown>> = {};
  collect(service, schema, [], paths, members);
  return Observe.withMap(Observe.fromProperties(members), (values) => {
    const state: Record<string, unknown> = {};
    paths.forEach((path, index) => {
      let target = state;
      for (const key of path.slice(0, -1)) {
        // Intermediate path entries are only ever the group objects created here.
        target = (target[key] ??= {}) as Record<string, unknown>;
      }
      target[path[path.length - 1]] = values[index];
    });
    // The state is built from exactly the observe members `T`'s schema describes.
    return state as State<T>;
  });
}

// Members are keyed by index (not a joined "a.b" path) so a key containing "." cannot collide.
function collect(
  target: unknown,
  schema: Schema,
  path: readonly string[],
  paths: (readonly string[])[],
  members: Record<string, Observe<unknown>>,
): void {
  for (const [key, member] of Object.entries(schema.properties ?? {})) {
    if (key === "serviceName" || key === "schema") continue;
    // A service member, or a group of them, is a property of a plain object.
    const value = (target as Record<string, unknown> | undefined)?.[key];
    if (value === undefined) continue;
    if (member.type === "observe") {
      // The schema describes this member as an observe.
      members[paths.length] = value as Observe<unknown>;
      paths.push([...path, key]);
    } else if (member.type === "object" || member.properties !== undefined) {
      collect(value, member, [...path, key], paths, members);
    }
  }
}
