// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Report, System } from "../../../index.js";

/** Logs what reports say failed, a run's an event started and a tick's alike: each report's errors are written once. */
export const logFailures = System.create({ name: "app/logFailures", observer: true, components: { read: [Report.errors], changed: [Report.errors] } }, row => {
    const { failures } = row[Report.errors];
    if (failures.length > 0) console.error("A run failed", failures);
});
