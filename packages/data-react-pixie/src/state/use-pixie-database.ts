// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useDatabase as useDatabaseHook } from "@adobe/data-react";
import { pixiePlugin } from "./pixie-plugin";

export const usePixieDatabase = () => useDatabaseHook(pixiePlugin);
