// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

export const dashboardPlugin = Database.Plugin.create({
  resources: {
    count: { default: 0 as number },
    log: { default: [] as readonly string[] },
    userName: { default: "Guest" as string },
  },
  transactions: {
    increment: (t) => {
      t.resources.count += 1;
      t.resources.log = [...t.resources.log, `Incremented to ${t.resources.count}`];
    },
    decrement: (t) => {
      if (t.resources.count > 0) {
        t.resources.count -= 1;
        t.resources.log = [...t.resources.log, `Decremented to ${t.resources.count}`];
      }
    },
    reset: (t) => {
      t.resources.count = 0;
      t.resources.log = [...t.resources.log, "Reset to 0"];
    },
    setUserName: (t, name: string) => {
      t.resources.userName = name;
      t.resources.log = [...t.resources.log, `Name changed to ${name}`];
    },
    clearLog: (t) => {
      t.resources.log = [];
    },
  },
});
