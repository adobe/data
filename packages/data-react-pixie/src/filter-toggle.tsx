import { useObservableValues } from "@adobe/data-react";
import { useDatabase } from "./hooks/use-database";
import type { FilterType } from "./pixie-plugin.js";

const FILTER_LABELS: Record<FilterType, string> = {
  none: "None",
  sepia: "Sepia",
  blur: "Blur",
  vintage: "Vintage",
  night: "Night",
};

const FILTER_OPTIONS = (Object.entries(FILTER_LABELS) as [FilterType, string][]).map(([value, label]) => ({
  value,
  label,
}));

export function FilterToggle() {
  const db = useDatabase();
  const values = useObservableValues(
    () => ({
      filterType: db.observe.resources.filterType,
    }),
    [],
  );

  const currentFilter = values?.filterType ?? "none";

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
      {FILTER_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => db.transactions.setFilterType({ filterType: value })}
          style={{
            padding: "0.25rem 0.5rem",
            fontWeight: currentFilter === value ? "bold" : "normal",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
