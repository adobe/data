// © 2026 Adobe. MIT License. See /LICENSE for details.

import { For, Show } from "solid-js";
import { fromObserve, useDatabase } from "@adobe/data-solid";
import { dashboardPlugin } from "../state/dashboard-plugin";

export function ActivityLog() {
  const db = useDatabase(dashboardPlugin);
  const log = fromObserve(db.observe.resources.log);

  return (
    <div class="activity-log">
      <div class="activity-header">
        <h3>Activity</h3>
        <Show when={(log() ?? []).length > 0}>
          <button class="clear-btn" onClick={() => db.transactions.clearLog()}>Clear</button>
        </Show>
      </div>
      <Show when={(log() ?? []).length > 0} fallback={<p class="empty">No activity yet.</p>}>
        <ul>
          <For each={log() ?? []}>
            {(entry) => <li>{entry}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
