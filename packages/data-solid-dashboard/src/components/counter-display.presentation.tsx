// © 2026 Adobe. MIT License. See /LICENSE for details.

export function render(args: { count: number }) {
  return (
    <div class="counter-display">
      <span class="count-value">{args.count}</span>
    </div>
  );
}
