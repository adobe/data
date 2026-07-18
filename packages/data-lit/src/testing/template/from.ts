// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Query } from "./query.js";

type TemplateLike = { readonly strings: readonly string[]; readonly values: readonly unknown[] };

// Duck-typed, DOM-free check for a Lit TemplateResult (or a nested one).
const isTemplate = (value: unknown): value is TemplateLike =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { strings?: unknown }).strings) &&
  Array.isArray((value as { values?: unknown }).values);

// Static markup + interpolated primitives, concatenated (recursive). Symbols
// (e.g. `nothing`), null/undefined, booleans and functions contribute no text.
const collectText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(collectText).join("");
  if (isTemplate(value)) {
    let out = "";
    for (let i = 0; i < value.strings.length; i++) {
      out += value.strings[i];
      if (i < value.values.length) out += collectText(value.values[i]);
    }
    return out;
  }
  return "";
};

// Every leaf binding value, flattened; nested templates are recursed into but
// not themselves pushed (those are exposed as `children`).
const collectValues = (value: unknown, into: unknown[]): void => {
  if (isTemplate(value)) {
    for (const v of value.values) collectValues(v, into);
  } else if (Array.isArray(value)) {
    for (const v of value) collectValues(v, into);
  } else {
    into.push(value);
  }
};

// The interpolated child templates directly inside `result` (flattening arrays,
// but not descending through other templates — `find` handles depth).
const collectChildren = (result: TemplateLike): Query[] => {
  const children: Query[] = [];
  const visit = (value: unknown): void => {
    if (isTemplate(value)) children.push(build(value));
    else if (Array.isArray(value)) value.forEach(visit);
  };
  for (const v of result.values) visit(v);
  return children;
};

const build = (result: TemplateLike): Query => {
  const text = collectText(result);
  const values: unknown[] = [];
  for (const v of result.values) collectValues(v, values);
  const children = collectChildren(result);
  const find = (fragment: string): Query | undefined => {
    for (const child of children) {
      if (child.text.includes(fragment)) return child;
      const deep = child.find(fragment);
      if (deep) return deep;
    }
    return undefined;
  };
  return {
    text,
    values,
    children,
    has: (fragment) => text.includes(fragment),
    find,
  };
};

/**
 * Wrap a presentation's `render(props)` output in a {@link Query} for DOM-free
 * assertions. Throws if given something that isn't a `TemplateResult`, so a
 * presentation that returns `nothing`/`undefined` fails loudly at the call site.
 */
export const from = (result: unknown): Query => {
  if (!isTemplate(result)) {
    throw new TypeError("Template.from expects a Lit TemplateResult");
  }
  return build(result);
};
