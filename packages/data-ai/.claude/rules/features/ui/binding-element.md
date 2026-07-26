---
paths:
  - 'src/**/*element*.ts'
  - 'src/**/elements/**/*.ts'
  - 'src/**/ui/**/*-element.ts'
---

# Binding elements

Binding elements are thin wires between application state and the UI — not designed for unit-testability. Non-trivial logic doesn't belong
here, it must be pushed into either the action/transaction layer or into presentations.

## Scope

This rule applies to **binding elements** — Lit elements that read state from a service via `useObservableValues`. If you are not using Lit then still try to adhere to a similar pattern to this with the same focus on separation of concerns and functional presentation if possible.
The discriminator is the base class:

- `ApplicationElement<T>` — from either `@adobe/data-lit` or `src/applications/application-element.ts`. Every app-level binding element
  extends this (directly or transitively). Concrete app bases like `FooElement`, `VideoGenerationElement`, `ImageEditorElement`,
  `StoryGenerationElement`, `ImageGenerationElement` are thin subclasses that bind a specific `MainService` type and inherit this contract.
- `DatabaseElement<T>` — the lower-level `@adobe/data-lit` base used by apps with no intermediate `*Element` layer (e.g.
  `HelloWorldElement`).

Plain `LitElement` subclasses that expose their API through `@property` alone (shared UI primitives like `media-timeline`, `model-picker`,
`toast-with-image`) are **not** binding elements. They don't subscribe to a service; their props are the entire contract. Out of scope for
this rule.

Presentation files (`*-presentation.ts`), CSS files (`*.css.ts`), tests (`*.test.ts`, `*.spec.ts`), and stories are also out of scope.

## The shape

A binding element is a thin wire between a service and a presentation. The class body contains:

1. Optional static `styles` property definition
2. Zero or more `@property` declarations (whitelisted below).
3. One `render()` method whose body is: one `useObservableValues(...)` call, another lifecycle hook call (in rare cases), a null-guard, and
   `return presentation.render({ ...values, ...callbacks })`.

No other members. No `@state`. No private handler fields. No lifecycle methods (`connectedCallback`, `updated`, `firstUpdated`,
`disconnectedCallback`) except on app-entrypoint classes where the lifecycle concern is app-boot shaped but cannot be expressed as a hook
(see `.claude/rules/hooks.md` for hook-first lifecycle).

## `@property` whitelist

The allowed set depends on **class role**:

- **App entrypoint classes** — the (typically empty-body) subclass of `ApplicationElement<T>` that binds a specific `MainService` type.
  Examples: `VideoGenerationElement`, `HelloWorldElement`, `TodoElement`. These accept injected services and top-level inputs from the host
  shell.
- **Concrete binding elements** — classes that extend an app entrypoint (or another concrete binding) and render UI. Examples: `Hud`,
  `FooRotationControlElement`, `CommunitySubmissionConnector`. These accept only:
  - Entity-id-shaped locator props (`entityId`, `entityIds`, `trackId`) that identify _where_ to load this element's data from.
  - Rare parent-forwarded flags passed straight to the presentation without branching on them (e.g. `highVolumeFlag` in `audio-view.ts`).
    Prefer promoting the flag into a service computed.

All other values come from the service.

## Observed values must be raw reads

Every expression inside `useObservableValues` is either a direct read of a service observable (`this.service.observe.*`) or a direct read of
a computed (`this.service.computed.*`). No `.map`, `.filter`, `.reduce`, arithmetic, conditionals, or `Observe.withMap`-inline composition.

If derivation is needed: ECS Database apps place it in a database computed (`plugins/computed`, read back as `this.service.computed.*`);
non-ECS apps place it in a dependent-state service function (`dependent-state-service`). If it is used only by this element, define it
locally in a sibling file and import it. Computed and dependent-state must use utilities from `Obsereve.*` rather than trying to call
observable functions.

**Bad - doesn't use utilities from `Obsereve.*`**

```ts
return notify => {
  const unobserve = oValue(value => {
    notify(value ** 2);
  });
  return unobserve;
};
```

**Good - uses utilities from `Obsereve.*`**

```ts
return Observe.withMap(oValue => value ** 2);
```

## Callbacks are one-liners

- Each callback passed to the presentation invokes a UI action with optional arguments or a transaction with optional arguments.
- Callbacks must not encode domain knowledge, branch on state, or build complex shapes. Logic belongs in the UI action layer or transactions
  layer.
- UI action functions and transactions must be called only via `this.service`, they must never be imported directly.
- Never consume the return value of a UI action or transaction call.
- Simple argument transformations are allowed — arithmetic, negation, fixed arguments, simple ternaries that select an argument value.

```ts
render() {
  return presentation.render({
    // UI action call without parameters — good
    saveProgress: this.service.actions.saveProgress,
    // UI action call with fixed argument — good
    setLandscape: () => this.service.actions.setOrientation('landscape'),
    // UI action call with simple ternary — good
    jump: (heroMode: boolean) => this.service.actions.move(heroMode ? 100 : 10),
    // transaction call - good
    play: this.service.transactions.playTrack
  });
}
```

## No derivation math in `render()`

**Derivation math** is forbidden in `render()`. Simple argument assembly in callbacks is the only exception — see **Action callbacks are
one-liners** above.

## Lifecycle goes through hooks

Any need for mount/unmount/update behavior routes through a hook. **Reuse order, one hook per file, presentation vs binding placement, and
testing notes:** `.claude/rules/hooks.md`.

Never inline lifecycle logic in the binding. App-entrypoint classes may override lifecycle methods when the concern is app-boot shaped
(service wiring, ancestor lookup); even then, prefer a hook.

Rare cases when an additional hook can be used in `render()`:

- focus on element
- scroll to element
- clean up on un-mount
- and other lifecycle-bound behaviour

Use `useEffect` for cleanup on unmount rather than `disconnectedCallback`:

```ts
render() {
  useEffect(() => {
    return () => this.service.actions.someCleanup();
  }, []); // empty array → runs cleanup on unmount only

  const values = useObservableValues(() => ({ ... }));
  if (!values) return nothing;
  return presentation.render(values);
}
```

In binding-elements `render()` doesn't need to be explicitly decorated with `withHooks()` because it's done implicitly in the
`ApplicationElement` base class.

## No timers, emitters, or broadcast channels

- Never `setInterval`, `setTimeout`, or `requestAnimationFrame`.
- Never `new EventEmitter`. Cross-element state flows through service observables.
- Never `new BroadcastChannel`. Cross-tab concerns go through a dedicated service.

## No direct database reads

Never call `this.service.get()`, `this.service.read()`, `this.service.select()`, or any synchronous accessor. The service interface does not
expose them by design; reaching for them means a missing computed.

## Presentation contract

A binding element imports a sibling `*-presentation.ts` file that exports exactly `render` (required) and optionally `unlocalized`. Nothing
else — no types, no styles, no helpers. Consumers derive the props type via `Parameters<typeof render>[0]`. Presentation stays hook-free by
default; element hooks live here or in shared modules per `.claude/rules/hooks.md` and `.claude/rules/presentation.md`.

**For refactors whose stated scope does not include presentations**, the matching `*-presentation.ts` file must not change. Verify with
`git diff --name-only | grep presentation`. If a scope-limited refactor requires a presentation signature change, stop and reconsider the
binding-side helper — the scope fence exists because presentations are the public contract between binding and render output.

Callback prop names use **verb** or **verbNoun** form. Never `on*` prefix. The binding-side variable matches the presentation prop name 1:1.
See `.claude/rules/presentation.md` for full examples.

## Size budget

A compliant binding element file is small enough that the `render()` body fits on screen without scrolling. If it doesn't, a concern has not
been extracted yet — find it.

## Deletion test

Delete everything except the class body. What remains should be: static styles assignment, property declarations, one
`useObservableValues(...)` call, another lifecycle hook call (in rare cases), a null-guard, and one render call. Anything else is a
violation.

## Good examples (in-tree)

- `src/applications/image-generation/elements/sub-navigation-panel/sub-navigation-panel.ts` — concrete binding element; one-liner action
  callback
- `src/applications/foo/elements/properties-panel/views/audio-view.ts` — entity-id-only + parent-forwarded flag
- `src/applications/image-editor/elements/hud/hud.ts` — concrete binding element (extends `ImageEditorElement`); `useObservableValues` reads
  a dependentState observable; forwards to presentation with spread.
- `src/applications/video-generation/elements/commerce-coachmark/commerce-coachmark.ts` — localization-only binding; trivially small and
  compliant.

## Counter-example (do not land)

```ts
@customElement(tagName)
export class BadControlElement extends FooElement {
  @property({ attribute: false }) entityIds: readonly Entity[] = [];
  @state() private _cachedSum = 0; // violation: @state
  private _handleChange?: (e: Event) => void; // violation: private handler

  connectedCallback() {
    // violation: lifecycle override
    super.connectedCallback();
    this._handleChange = e => (this._cachedSum += Number((e.target as HTMLInputElement).value));
  }

  @withHooks // Redundant
  render() {
    const values = useObservableValues(() => ({
      items: this.service.observe.select(/* ... */),
      total: Observe.withMap(
        // violation: logic in observed values
        this.service.observe.select(/* ... */),
        rows => rows.reduce((a, r) => a + r.duration, 0)
      ),
    }));
    const clamped = Math.max(0, Math.min(100, values.total)); // violation: derivation in render
    const onSave = (v: number) => {
      // violation: logic in callback + onX name
      const normalized = Math.round(v * 100) / 100;
      if (!Number.isFinite(normalized)) return;
      this.service.transactions.updateThing({ value: normalized });
    };
    return presentation.render({ total: clamped, onSave });
  }
}
```
