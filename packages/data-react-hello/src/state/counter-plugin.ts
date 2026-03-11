// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

export const counterPlugin = Database.Plugin.create({
  resources: {
    count: { default: 0 as number },
  },
  transactions: {
    increment: (t) => {
      t.resources.count += 1;
    },
  },
});
