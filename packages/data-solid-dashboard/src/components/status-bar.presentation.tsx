// © 2026 Adobe. MIT License. See /LICENSE for details.

export function render(args: {
  userName: string;
  actionCount: number;
  count: number;
}) {
  return (
    <div class="status-bar">
      <span>{args.userName}</span>
      <span>{args.actionCount} actions</span>
      <span>Count: {args.count}</span>
    </div>
  );
}
