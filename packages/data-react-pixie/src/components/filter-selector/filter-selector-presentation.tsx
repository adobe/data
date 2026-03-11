// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { FilterType } from "../../types/filter-type";

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

export function render(args: {
  currentFilter: FilterType;
  setFilterType: (filterType: FilterType) => void;
}) {
  const { currentFilter, setFilterType } = args;
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
      {FILTER_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setFilterType(value)}
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
