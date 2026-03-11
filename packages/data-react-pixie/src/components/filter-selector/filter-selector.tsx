// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useObservableValues } from "@adobe/data-react";
import { usePixieDatabase } from "../../state/use-pixie-database";
import * as presentation from "./filter-selector-presentation";

export function FilterSelector() {
  const db = usePixieDatabase();
  const values = useObservableValues(
    () => ({
      filterType: db.observe.resources.filterType,
    }),
    [],
  );

  const currentFilter = values?.filterType ?? "none";

  return presentation.render({
    currentFilter,
    setFilterType: (filterType) => db.transactions.setFilterType({ filterType }),
  });
}
