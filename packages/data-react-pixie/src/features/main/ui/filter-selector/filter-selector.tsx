// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useObservableValues } from "@adobe/data-react";
import { useMainService } from "../use-main-service.js";
import * as presentation from "./filter-selector-presentation.js";

export function FilterSelector() {
  const db = useMainService();
  const values = useObservableValues(
    () => ({
      filter: db.observe.resources.filter,
    }),
    [],
  );

  const currentFilter = values?.filter ?? "none";

  return presentation.render({
    currentFilter,
    setFilter: (filter) => db.transactions.setFilter({ filter }),
  });
}
