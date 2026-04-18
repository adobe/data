// © 2026 Adobe. MIT License. See /LICENSE for details.

import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";

export function ControlPanel() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count);
  let nameInput!: HTMLInputElement;

  return (
    <div class="control-panel">
      <div class="counter-controls">
        <button onClick={() => db.transactions.increment()}>+</button>
        <button
          onClick={() => db.transactions.decrement()}
          disabled={(count() ?? 0) <= 0}
        >
          -
        </button>
        <button onClick={() => db.transactions.reset()}>Reset</button>
      </div>
      <div class="name-controls">
        <input ref={nameInput} type="text" placeholder="Enter name" />
        <button onClick={() => db.transactions.setUserName(nameInput.value)}>
          Set Name
        </button>
      </div>
    </div>
  );
}
