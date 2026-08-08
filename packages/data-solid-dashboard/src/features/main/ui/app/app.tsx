// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseProvider } from "@adobe/data-solid";
import { MainService } from "../../services/main-service/main-service.js";
import { StatusBar } from "../status-bar/status-bar.jsx";
import { ControlPanel } from "../control-panel/control-panel.jsx";
import { CounterDisplay } from "../counter-display/counter-display.jsx";
import { ActivityLog } from "../activity-log/activity-log.jsx";
import "./app.css";

export function App() {
  return (
    <DatabaseProvider plugin={MainService.plugin}>
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
