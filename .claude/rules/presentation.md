---
paths:
  - 'packages/**/*presentation.ts'
---

# Presentation authoring

A presentation is a pure function: data + action callbacks → renderable
output. It has no `this`, no hooks, no subscriptions, no side effects,
no component state, no business logic. The container element supplies
everything it needs.

This rule is framework-agnostic. The framework-specific bindings are in
the table at the bottom.

## Exports

A presentation file exports exactly one symbol: `render` — the pure
function. No types, styles, helpers, constants, or re-exports. If you
need shared logic, keep it inside `render` as a local helper. If you
need shared UI, that's another presentation.

Consumers derive the props type via `Parameters<typeof render>[0]` —
never declare or export a separate props type.

## Action callbacks are actions, not events

Use **verbNoun** form. The presentation invokes the callback when the
user acts; it *is* the action, with no intermediary event to handle.

```ts
// ✅
export function render({ dismiss, setLayout, createFolder }: {
    dismiss: () => void;
    setLayout: (layout: "grid" | "row") => void;
    createFolder: (name: string) => void;
}) { /* ... */ }

// ❌
export function render({ onDismiss, onLayoutChange, onCreate }: { ... }) {}
```

## Testing

A pure `render(props)` is trivial to test — no DOM, no rendering, no
component lifecycle. Pass stub props (no-op callbacks) and assert on the
**declaration** it returns. Co-locate tests as `<name>-presentation.test.ts`.

For Lit, wrap the result with `Template.from` (from `@adobe/data-lit`) and
assert on the query, not on positional `.values` indices:

```ts
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./todo-toolbar-presentation.js";

it("wires the Add button and shows the stats", () => {
    const addTodo = () => {};
    const t = Template.from(render(props({ addTodo, totalCount: 3, completedCount: 1 })));
    expect(t.has("<sp-textfield")).toBe(true);     // presence
    expect(t.text).toContain("1 / 3 completed");   // static + primitive text
    expect(t.values).toContain(addTodo);           // callback wired (identity, not values[3])
});
```

`Template.Query` exposes `text`, `values`, `children`, `has(fragment)`, and
`find(fragment)`. Prefer **identity** checks (`values` `toContain` a
callback / `nothing` / a bound value) over positions. To exercise a
callback, pull it from `values` and call it with a plain synthetic event —
no mocks, no DOM.

A presentation that only composes lazy child-element wrappers (or imports
Spectrum components) needs a `// @vitest-environment jsdom` docblock so the
module's custom-element side effects can load — the assertions still never
render or touch the DOM. Presentations of native elements run under Node.

## Framework bindings

| Framework | Return type      | Common template imports             | Test assertion target                        |
| --------- | ---------------- | ----------------------------------- | -------------------------------------------- |
| Lit       | `TemplateResult` | `html`, `nothing`, `svg`, `repeat`  | `Template.from(...)` query (`@adobe/data-lit`) |
| React     | `ReactNode`      | JSX runtime                         | render-to-string or virtual-DOM utility      |
| Solid     | `JSX.Element`    | JSX runtime                         | render-to-string or virtual-DOM utility      |
