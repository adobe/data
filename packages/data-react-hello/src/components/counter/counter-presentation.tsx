// © 2026 Adobe. MIT License. See /LICENSE for details.

export function render(args: { count: number; increment: () => void }) {
  const { count, increment } = args;
  return (
    <div>
      <p className="counter">Count: {count}</p>
      <button type="button" onClick={increment}>
        Increment
      </button>
    </div>
  );
}
