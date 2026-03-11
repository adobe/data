// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { agentPlugin } from "./state/agent-plugin.js";

export class TictactoeElement extends DatabaseElement<typeof agentPlugin> {
  get plugin() {
    return agentPlugin;
  }
}
