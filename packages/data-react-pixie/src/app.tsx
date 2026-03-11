// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Application } from "@pixi/react";
import { DatabaseProvider } from "@adobe/data-react";
import { pixiePlugin } from "./state/pixie-plugin";
import { FilterSelector } from "./components/filter-selector/filter-selector";
import { PixieTick } from "./components/pixie-scene/pixie-tick";
import { PixieScene } from "./components/pixie-scene/pixie-scene";

export function App() {
  return (
    <DatabaseProvider plugin={pixiePlugin}>
      <FilterSelector />
      <Application background="beige" width={640} height={480}>
        <PixieTick />
        <PixieScene />
      </Application>
    </DatabaseProvider>
  );
}

