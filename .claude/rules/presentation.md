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

A pure `render(props)` is trivial to test under Node — no DOM, no
component lifecycle. Pass stub props with no-op callbacks and assert on
the returned structure. Co-locate tests as `<name>-presentation.test.ts`.

## Framework bindings

| Framework | Return type      | Common template imports             | Test assertion target                    |
| --------- | ---------------- | ----------------------------------- | ---------------------------------------- |
| Lit       | `TemplateResult` | `html`, `nothing`, `svg`, `repeat`  | `result.strings` / `result.values`       |
| React     | `ReactNode`      | JSX runtime                         | render-to-string or virtual-DOM utility  |
| Solid     | `JSX.Element`    | JSX runtime                         | render-to-string or virtual-DOM utility  |
