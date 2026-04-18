// © 2026 Adobe. MIT License. See /LICENSE for details.

import { For, Show } from "solid-js";

export function render(args: {
  log: readonly string[];
  clearLog: () => void;
}) {
  return (
    <div class="activity-log">
      <div class="activity-header">
        <h3>Activity</h3>
        <Show when={args.log.length > 0}>
          <button class="clear-btn" onClick={args.clearLog}>Clear</button>
        </Show>
      </div>
      <Show when={args.log.length > 0} fallback={<p class="empty">No activity yet.</p>}>
        <ul>
          <For each={args.log}>
            {(entry) => <li>{entry}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
