---
paths:
  - 'packages/**/elements/**/*.ts'
---

# Lazy Lit element pattern

Each Lit custom element lives in its own folder and is exposed to
external code through a single lazy wrapper function. The element class
itself is loaded only on first invocation, so consumers pay no bundle
cost for elements they never render.

## Folder layout

For an element conceptually named `foo`:

```
foo/
  foo.ts                # PUBLIC: lazy wrapper Foo()
  foo-element.ts        # PRIVATE: the LitElement class
  foo-presentation.ts   # PRIVATE: pure render(props) function
  foo.css.ts            # PRIVATE: styles
```

External code only ever imports `foo.ts`. The other three are
implementation detail of the folder.

## The lazy wrapper (`foo.ts`)

A PascalCase function that returns an `html` template fragment. It
fires a dynamic `import()` of the element file on every call (the
import promise is intentionally unawaited — the browser deduplicates
and Lit upgrades the unknown element once the class registers).

```ts
import { html } from "lit";
import type { TemplateResult } from "lit";

export const Foo = (args: { count: number }): TemplateResult => {
    void import("./foo-element.js");
    return html`<my-foo .count=${args.count}></my-foo>`;
};
```

Rules:

- Exactly one public export: the wrapper function.
- Argument shape is a single typed object (or omitted entirely).
- The custom-element tag is hardcoded as a literal — no shared `tagName`
  symbol crosses the wrapper / element boundary.
- The wrapper passes typed args via `.prop=${args.prop}` bindings, never
  attribute strings.

## The element file (`foo-element.ts`)

```ts
import { customElement } from "lit/decorators.js";
import * as presentation from "./foo-presentation.js";
import { styles } from "./foo.css.js";

const tagName = "my-foo";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: FooElement;
    }
}

@customElement(tagName)
export class FooElement extends LitElement {
    static styles = styles;
    render() { return presentation.render({ /* … */ }); }
}
```

- `tagName` is a private const; the global `HTMLElementTagNameMap`
  declaration uses it so the wrapper's `html\`<my-foo></my-foo>\``
  template is type-checked.
- One public export: the class.
- Side-effect imports of *other* element files are forbidden — invoke
  their lazy wrappers from inside the presentation instead, so children
  are tree-shaken too.

## Composition: render children via wrappers

Inside a presentation, render child elements by calling their lazy
wrappers, not by writing their tag literals or by importing their
classes. This is what keeps the lazy graph honest end-to-end.

```ts
import { html } from "lit";
import { Bar } from "../bar/bar.js";

export const render = (props: { … }) => html`
    <section>${Bar({ kind: props.kind })}</section>
`;
```

## Dynamic-tag rendering

Do not use `lit/static-html` / `unsafeStatic` to switch between
elements. Take a render-callback prop instead:

```ts
@property({ attribute: false })
renderChild!: (args: { service: SomeDb }) => TemplateResult;

// caller passes:
.renderChild=${({ service }) => Bar({ service })}
```

This keeps the child's lazy wrapper as the single point of contact and
preserves type checking across the boundary.

## Entry-point mounting

Even the top-level element is mounted through its lazy wrapper. A
`main.ts` calls `render(Foo(args), document.getElementById("app")!)` —
no side-effect import, no `document.createElement`.
