// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Service } from "./service.js";


export function isService(value: unknown): value is Service {
  return value !== null && typeof value === "object" && "serviceName" in value && typeof value.serviceName === "string";
}
