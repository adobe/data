// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseProvider } from "@adobe/data-react";
import { counterPlugin } from "./state/counter-plugin";
import { Counter } from "./components/counter";

export function App() {
  return (
    <DatabaseProvider plugin={counterPlugin}>
      <Counter />
    </DatabaseProvider>
  );
}
