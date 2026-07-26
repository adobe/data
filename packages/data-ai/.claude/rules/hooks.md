---
paths:
  - '**/use-*.ts'
  - '**/hooks/**/*.ts'
---

# Element hooks (Lit / `@adobe/data-lit`)

Hooks tie **element lifecycle** and **DOM** concerns to reactive updates. This rule covers **where** hooks live, **how** to name and split
them, and **what** to reuse before writing something new.

---

## Where hooks belong

| Location                                                                        | Role                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Binding element** (`ApplicationElement` / app `*Element` / `DatabaseElement`) | **Default home** for hooks: `useObservableValues`, refs, resize, visibility, keyboard, etc. Compute values here and pass **plain data + action callbacks** into `presentation.render(...)`.                    |
| **Presentation** (`*-presentation.ts`)                                          | **Hook-free** so `render` stays a pure `props → TemplateResult` function. **Exception:** only when unavoidable for performance or platform constraints — document **why** a binding-level hook could not work. |
| **Shared UI primitives** (plain `LitElement`, not a binding element)            | Hooks allowed when the primitive owns DOM behavior; still follow **one hook per file** and the reuse order below.                                                                                              |

---

## Reuse before inventing

Search in this order before adding a new hook module:

1. **`src/elements/hooks/`** — shared hooks for Studio / platform elements.
2. **`@adobe/data-lit`** — framework-provided hooks and primitives.
3. **Application-specific** — under `src/applications/<app>/…` when behavior is owned by that app.
4. **Element-local** — `use-<concern>.ts` next to the element when behavior is specific to one component.

---

## One hook, one file

- Each custom hook lives in **its own module** with a clear name (`use-element-size.ts`, `use-my-panel-keyboard.ts`).
- Do **not** bundle unrelated hooks in one file.
- Export the hook (and any minimal types its signature needs). Avoid dumping unrelated utilities into the same file.

---

## Encapsulation

- A hook should own a **single concern**: e.g. "sync width to state", "subscribe to window resize", "focus prompt on open".
- Prefer **narrow return values** (values + small set of callbacks) over mutating arbitrary element fields.

---

## Execute

When adding or changing hook code:

1. Confirm the hook cannot live on a **binding element** (or shared hook package) before putting it in a **presentation** file.
2. Run the **reuse** search order above; extend an existing hook if the behavior is the same concern.
3. Add or edit **one file per hook**; name with the `use-` prefix consistent with the rest of the repo.
4. Keep **binding** `render()` thin — call hooks, then pass results into `presentation.render`.
