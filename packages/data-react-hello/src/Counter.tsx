// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useDatabase, useObservableValues } from "@adobe/data-react";
import { counterPlugin } from "./counter-plugin";

export function Counter() {
  const db = useDatabase(counterPlugin);
  const values = useObservableValues(() => ({
    count: db.observe.resources.count,
  }));

  if (!values) return null;
  return (
    <div>
      <p className="counter">Count: {values.count}</p>
      <button type="button" onClick={() => db.transactions.increment()}>
        Increment
      </button>
    </div>
  );
}
