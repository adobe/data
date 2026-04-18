// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseProvider } from "@adobe/data-solid";
import { dashboardPlugin } from "./state/dashboard-plugin";
import { StatusBar } from "./components/status-bar";
import { ControlPanel } from "./components/control-panel";
import { CounterDisplay } from "./components/counter-display";
import { ActivityLog } from "./components/activity-log";
import "./app.css";

export function App() {
  return (
    <DatabaseProvider plugin={dashboardPlugin}>
      <div class="dashboard">
        <StatusBar />
        <div class="main-content">
          <ControlPanel />
          <CounterDisplay />
        </div>
        <ActivityLog />
      </div>
    </DatabaseProvider>
  );
}
