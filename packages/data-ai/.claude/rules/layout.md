---
paths:
  - '**/*.css.ts'
  - '**/*.css'
  - '**/elements/**/*.ts'
---

# Layout and component types

UI components are one of two types with no overlap. Every component is either terminal or layout.

---

## Terminal components

- Render their own UI (buttons, inputs, cards, text, etc.)
- Contain CSS for their appearance
- **Never** contain any external margin

Terminal components are the leaves of the component tree. They own their visual styling and content.

---

## Layout components

- Do **not** render any UI themselves
- Composed only of other layout or terminal components
- Responsible for interior gaps between their children
- **Never** contain any external margin
- Should not need CSS 90% of the time or more — use the standard layout utility classes below.
- Generally have no business logic and should never re-render — keeps re-renders confined to lower terminal levels

**Exception:** Some layout components explicitly manage state (animating, showing/hiding tabs, accordions). Those will have logic and may
re-render.

---

## Layout utility classes

Define `--layout-gap`, `--layout-gutter`, and `--layout-padding` on `:root` (or the root element) with your spacing scale. In Lit, import
the styles and include them in `export const styles` of the root element or shared base class.

```css
/* -- Direction --------------------------------------------------------- */
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--layout-gap);
}
.row {
  display: flex;
  flex-direction: row;
  gap: var(--layout-gap);
}
.cluster {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--layout-gap);
}

/* -- Gap overrides ----------------------------------------------------- */
.gap-gutter {
  gap: var(--layout-gutter);
}
.gap-padding {
  gap: var(--layout-padding);
}
.gap-none {
  gap: 0;
}

/* -- Inset (padding) --------------------------------------------------- */
.inset {
  padding: var(--layout-padding);
}
.inset-gutter {
  padding: var(--layout-gutter);
}
.inset-gap {
  padding: var(--layout-gap);
}

/* -- Alignment --------------------------------------------------------- */
.center {
  justify-content: center;
  align-items: center;
}
.spread {
  justify-content: space-between;
}
.align-center {
  align-items: center;
}
.align-start {
  align-items: flex-start;
}
.align-end {
  align-items: flex-end;
}

/* -- Sizing (applied to children) -------------------------------------- */
.fill {
  flex: 1;
}
.fit {
  flex: 0 0 auto;
}
```

For custom spacing in terminal components, use `var(--layout-gap)`, `var(--layout-gutter)`, or `var(--layout-padding)` rather than hardcoded
lengths.

---

## Why this split matters

Layout components that rarely re-render are efficient. State changes and user interactions trigger updates at terminal levels; layout
structure above stays stable. Avoid putting reactive logic in layout components unless the layout itself is dynamic (tabs, accordions,
animations).

---

## Execute

When creating or modifying UI components:

1. Classify as terminal or layout. No overlap.
2. Terminal: owns UI and CSS; never external margin.
3. Layout: no own UI; only layout/terminal children; owns interior gaps; never external margin.
4. Prefer standard layout tokens for layout components; avoid custom CSS when possible.
5. Keep layout components free of business logic unless they explicitly manage layout state.
