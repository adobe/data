import { Report, System } from "../../../index.js";

/** The failures logged: a report's failures only grow, by its observer pass's, keeping those it had. */
const logged = new WeakSet<Report.Failure>();

/**
 * Logs what reports say failed, a run's an event started and a tick's alike, as they change. An observer pass's
 * failures join its report after it, so the next pass logs them.
 */
export const logFailures = System.create({ name: "app/logFailures", observer: true, components: { read: [Report.errors], changed: [Report.errors] } }, row => {
    const fresh = row[Report.errors].failures.filter(failure => !logged.has(failure));
    for (const failure of fresh) logged.add(failure);
    if (fresh.length > 0) console.error("A run failed", fresh);
});
