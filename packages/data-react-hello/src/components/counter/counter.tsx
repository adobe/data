// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useObservableValues } from "@adobe/data-react";
import { useCounterDatabase } from "../../state/use-counter-database";
import * as presentation from "./counter-presentation";

export function Counter() {
  // get your database context (The only context you will ever need)
  const db = useCounterDatabase();
  // observe the values you need
  // when they change we will re-render
  const values = useObservableValues(() => ({
    count: db.observe.resources.count,
  }));

  // if the values are not ready yet, we will render nothing
  if (!values) return null;
  // once we have our minimum required values then render,
  // injecting the current values and any action callbacks.
  // note we use verbNoun action semantics NEVER onClick event style semantics.
  return presentation.render({
    ...values,
    // increment and all our functions are pure so we never need to bind `this`
    increment: db.transactions.increment,
  });
}
