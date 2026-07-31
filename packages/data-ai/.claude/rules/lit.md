---
paths:
  - '**/ui/**/*.ts'
  - '**/elements/**/*.ts'
  - '**/*-element.ts'
---

# Lit element authoring

Lit elements live in the `components/` layer per the structure rule. Consume Observe and void actions from plugins per the service rule.

---

## Extending DatabaseElement

Binding elements extend `DatabaseElement<typeof myPlugin>` — either directly or via an intermediate base class. The required plugin must be
specified in the generic.

```ts
// Direct
export class HelloWorldElement extends DatabaseElement<typeof helloWorldPlugin> {
  get plugin() {
    return helloWorldPlugin;
  }
}

// Indirect — base extends DatabaseElement, leaf specifies plugin
export class LayoutElement<T extends MyApplicationPlugin = MyApplicationPlugin> extends CoreApplicationElement<T> {}
export class ToolbarElement extends LayoutElement<typeof toolbarPlugin> {}
```

---

## Binding element vs presentation

**Binding element** — the Lit custom element that:

- Injects observed values via `useObservableValues`
- Triggers re-render when those values change
- Binds action callbacks to the presentation

**Presentation** — a pure function (no hooks by default) that receives data and action callbacks as props and returns a `TemplateResult`.
Keep reactive logic in the binding element; presentation stays pure.

---

## useObservableValues

_Most_ binding elements use a **single** `useObservableValues` call. Collect all observed values in one object.

**Observe only what you need** — the minimal values required for rendering. For values that may resolve slowly, wrap with
`Observe.withDefault`.

```ts
render() {
  const values = useObservableValues(() => ({
    visible: this.service.computed.isViewVisible(name),
    userProfile: this.service.services.authentication.userProfile,
  }));
  if (!values) return;
  return presentation.render({ ...values, toggleView: () => this.service.transactions.setViewVisible({ name, visible: true }) });
}
```

---

## Presentation exports

Presentation files ONLY export `render` (and `unlocalized` bundles where appropriate). Nothing else. If you need render args type
externally, use `Parameters<typeof render>[0]`.

**Styles:** Do not import or re-export Lit `CSSResult` from presentations. The binding element imports `*.css.ts` and sets `static styles`
there.

---

## Action callbacks (not events)

Use **verb** or **verbNoun** names — never `on*` prefix. See `features/ui/presentation.md` for full examples and rationale.

---

## Lit properties

**Almost never** use `@property` on binding elements.

**Exception:** Use properties ONLY when needed to bind to the correct entity in the database — e.g. `entity` for table rows, `layer` for
view hosts. Multiple instances of the same element need a property to identify which entity they represent.

---

## Hooks

Canonical rules (reuse order, one hook per file, binding vs presentation): `hooks.md`.

Use hooks from `src/elements/hooks/` and `@adobe/data-lit` instead of `connectedCallback`/`disconnectedCallback`. Use `useEffect` for
setup/teardown, `useKeyboardEvent` for single key events.

---

## Execute

When creating or modifying a Lit element:

1. Extend `DatabaseElement<typeof myPlugin>` (directly or indirectly) with the required plugin specified.
2. Split into binding element (reactive) and presentation (pure).
3. Use a single `useObservableValues` in the binding element. Observe only minimal values; use `Observe.withDefault` for slow-resolving
   values.
4. Pass observed values and action callbacks to presentation.
5. Keep presentation pure — no hooks (see `hooks.md` for exceptions).
6. Add `@property` only when entity binding requires it (multiple instances).
7. Presentation exports only `render` (and localization bundles where appropriate). Binding element sets `static styles` from `*.css.ts`.
8. Add `*-presentation.test.ts` for presentation when appropriate; do not unit test binding elements.
9. Never include business logic within binding elements. Move into computed values or action handlers.
10. Good binding elements should be extremely small.
