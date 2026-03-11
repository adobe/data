// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useDatabase } from "@adobe/data-react";
import { counterPlugin } from "./counter-plugin";

export const useCounterDatabase = () => useDatabase(counterPlugin);
