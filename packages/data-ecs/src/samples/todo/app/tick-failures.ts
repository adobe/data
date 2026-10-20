import { System, report, type World } from "../../../index.js";

/** The last tick's report logged, and how many of its failures were. */
let logged: World.Report | null = null;
let count = 0;

/**
 * Logs what ticks' reports say failed: nothing else sees them, since no event started those runs. It reads `report`
 * on every pass, without `changed`, because the failures of a tick's observer systems are added to the tick's report
 * after its pass and don't mark it changed. Those are logged by the next run's pass; a tick that came first would
 * replace the report, but this app ticks only after a run.
 */
export const logTickFailures = System.create({ name: "app/logTickFailures", observer: true, resources: { read: [report] } }, ({ resources }) => {
    const current = resources[report];
    if (current === logged && current.failures.length === count) return;
    // An amended report keeps the failures it had, so only those after them are new.
    const amended = logged !== null && logged.failures.length <= current.failures.length && logged.failures.every((failure, i) => current.failures[i] === failure);
    const fresh = current.failures.slice(amended ? count : 0);
    logged = current;
    count = current.failures.length;
    if (fresh.length > 0) console.error("A tick failed", fresh);
});
