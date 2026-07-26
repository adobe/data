---
paths:
  - '**/*presentation.test.ts'
---

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
