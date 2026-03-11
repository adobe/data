// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useObservableValues } from "@adobe/data-react";
import { usePixieDatabase } from "../../state/use-pixie-database";
import { getFiltersForType } from "./pixie-filters";
import * as presentation from "./pixie-scene-presentation";

export function PixieScene() {
  const db = usePixieDatabase();
  const values = useObservableValues(
    () => ({
      sprites: db.observe.select(db.archetypes.Sprite.components),
      filterType: db.observe.resources.filterType,
    }),
    [],
  );

  if (!values) return null;

  const filters = getFiltersForType(values.filterType ?? "none");

  return presentation.render({
    filters,
    sprites: values.sprites,
  });
}
