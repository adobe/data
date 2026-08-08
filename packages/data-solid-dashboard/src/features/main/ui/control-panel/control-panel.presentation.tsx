// © 2026 Adobe. MIT License. See /LICENSE for details.

export function render(args: {
  count: () => number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  setUserName: (name: string) => void;
}) {
  let nameInput!: HTMLInputElement;

  return (
    <div class="control-panel">
      <div class="counter-controls">
        <button onClick={args.increment}>+</button>
        <button onClick={args.decrement} disabled={args.count() <= 0}>-</button>
        <button onClick={args.reset}>Reset</button>
      </div>
      <div class="name-controls">
        <input ref={nameInput} type="text" placeholder="Enter name" />
        <button onClick={() => args.setUserName(nameInput.value)}>Set Name</button>
      </div>
    </div>
  );
}
