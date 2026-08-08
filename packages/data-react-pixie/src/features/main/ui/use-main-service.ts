// © 2026 Adobe. MIT License. See /LICENSE for details.
import { useDatabase } from "@adobe/data-react";
import { MainService } from "../services/main-service/main-service.js";

// The single main-service context every binding component reads. Wraps
// `useDatabase(MainService.plugin)` so the plugin identity is named once.
export const useMainService = () => useDatabase(MainService.plugin);
