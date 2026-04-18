# @adobe/data-solid

SolidJS bindings for [@adobe/data](https://www.npmjs.com/package/@adobe/data) — context provider and reactive primitives for the ECS database.

## Install

```bash
pnpm add @adobe/data @adobe/data-solid solid-js
```

## Peer Dependency

Requires `solid-js >= 1.7.0`.

## Exports

| Export | Purpose |
|---|---|
| `DatabaseProvider` | Context provider — wraps your app and creates/extends a database from a plugin |
| `DatabaseContext` | Raw Solid context (rarely needed directly) |
| `useDatabase` | Retrieve the database for a given plugin from context |
| `fromObserve` | Bridge an `Observe<T>` to a Solid `Accessor<T>` with optional default |

## Usage

### 1. Provide the database

```tsx
import { DatabaseProvider } from "@adobe/data-solid";
import { myPlugin } from "./state/my-plugin";

function App() {
  return (
    <DatabaseProvider plugin={myPlugin}>
      <Counter />
    </DatabaseProvider>
  );
}
```

### 2. Observe and render

`fromObserve` bridges an `@adobe/data` observable into a Solid accessor.
Pass a default value to eliminate `undefined` from the type:

```tsx
import { fromObserve, useDatabase } from "@adobe/data-solid";
import { myPlugin } from "./state/my-plugin";
import * as presentation from "./counter.presentation";

function Counter() {
  const db = useDatabase(myPlugin);
  const count = fromObserve(db.observe.resources.count, 0);

  return presentation.render({ count });
}
```

### 3. Presentation layer

Presentation files export a pure `render` function that accepts accessors
and action callbacks. Accessor calls inside JSX create fine-grained
reactive subscriptions — only the specific DOM nodes that depend on a
value update when it changes:

```tsx
export function render(args: { count: () => number }) {
  return <span>{args.count()}</span>;
}
```

## Why `fromObserve` instead of `from` directly?

Solid's built-in `from()` works at runtime with `Observe<T>`, but TypeScript
cannot infer `T` through the complex `Setter<T>` overloads in `Producer<T>`.
`fromObserve` forwards the generic so types resolve correctly. It also
accepts an optional default value via a `const` generic `D`, so
`Accessor<T | D>` collapses to `Accessor<T>` when the default is a subtype
of `T` — no manual casts needed.
