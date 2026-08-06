// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useObservableValues } from "@adobe/data-react";
import { useMainService } from "../use-main-service.js";
import { getFiltersForType } from "./pixie-filters.js";
import * as presentation from "./pixie-scene-presentation.js";

export function PixieScene() {
  const db = useMainService();
  const values = useObservableValues(
    () => ({
      sprites: db.observe.select(db.archetypes.Sprite.components),
      filter: db.observe.resources.filter,
    }),
    [],
  );

  if (!values) return null;

  const filters = getFiltersForType(values.filter ?? "none");

  return presentation.render({
    filters,
    sprites: values.sprites,
  });
}
