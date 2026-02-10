# @adobe/data-react

React bindings for [@adobe/data](https://www.npmjs.com/package/@adobe/data) — hooks and context for the ECS database and observables.

## Install

```bash
pnpm add @adobe/data @adobe/data-react react
```

## Peer Dependency

Requires `react >= 17.0.0` (supports React 17, 18, 19).

## Usage

Use `useObservableValues` for everything you need to observe — pass a factory that returns an object of observables:

```tsx
import { DatabaseProvider, useDatabase, useObservableValues } from "@adobe/data-react";
import { Database } from "@adobe/data/ecs";

const myPlugin = Database.Plugin.create({ /* ... */ });

function App() {
  return (
    <DatabaseProvider plugin={myPlugin}>
      <Counter />
    </DatabaseProvider>
  );
}

function Counter() {
  const db = useDatabase(myPlugin);
  const values = useObservableValues(() => ({
    count: db.observe.resources.count,
  }));

  if (!values) return null;
  return (
    <div>
      <p>Count: {values.count}</p>
      <button onClick={() => db.transactions.increment()}>Increment</button>
    </div>
  );
}
```
