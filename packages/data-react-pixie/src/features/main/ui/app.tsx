// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Application } from "@pixi/react";
import { DatabaseProvider } from "@adobe/data-react";
import { MainService } from "../services/main-service/main-service.js";
import { FilterSelector } from "./filter-selector/filter-selector.js";
import { PixieTick } from "./pixie-scene/pixie-tick.js";
import { PixieScene } from "./pixie-scene/pixie-scene.js";

export function App() {
  return (
    <DatabaseProvider plugin={MainService.plugin}>
      <FilterSelector />
      <Application background="beige" width={640} height={480}>
        <PixieTick />
        <PixieScene />
      </Application>
    </DatabaseProvider>
  );
}
