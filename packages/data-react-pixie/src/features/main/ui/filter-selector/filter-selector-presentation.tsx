// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { FilterKind } from "../../data/filter-kind/filter-kind.js";

const filterLabels: Record<FilterKind, string> = {
  none: "None",
  sepia: "Sepia",
  blur: "Blur",
  vintage: "Vintage",
  night: "Night",
};

// Object.entries widens keys to string; filterLabels is keyed by exactly FilterKind.
const filterOptions = (Object.entries(filterLabels) as [FilterKind, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function render(args: {
  currentFilter: FilterKind;
  setFilter: (filter: FilterKind) => void;
}) {
  const { currentFilter, setFilter } = args;
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
      {filterOptions.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setFilter(value)}
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
