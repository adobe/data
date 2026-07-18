// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A DOM-free view over a Lit `TemplateResult`, for asserting on what a pure
 * `render(props)` presentation *declares* — without mounting anything. Built by
 * `Template.from`.
 *
 * - `text` — all static markup plus interpolated primitives, concatenated
 *   (recursive). Use for presence: `q.has("<sp-toast")`, `q.text`.
 * - `values` — every leaf binding value, flattened across nested templates in
 *   source order (nested templates themselves are excluded — they live in
 *   `children`). Use identity checks rather than positions:
 *   `expect(q.values).toContain(onClick)`, `.toContain(nothing)`.
 * - `children` — the interpolated child templates (`${html`…`}`), each wrapped.
 * - `has` / `find` — presence sugar and a recursive lookup of the first child
 *   template whose `text` includes a fragment.
 *
 * Note: `find` only sees *interpolated* sub-templates; elements written inline
 * in a single `html` literal are part of `text`, not `children`.
 */
export type Query = {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly children: readonly Query[];
  has(fragment: string): boolean;
  find(fragment: string): Query | undefined;
};
