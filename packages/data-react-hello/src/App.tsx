// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseProvider } from "@adobe/data-react";
import { counterPlugin } from "./counter-plugin";
import { Counter } from "./Counter";

export function App() {
  return (
    <DatabaseProvider plugin={counterPlugin}>
      <Counter />
    </DatabaseProvider>
  );
}
