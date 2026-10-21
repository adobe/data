import { Report, System } from "../../../index.js";

/** The failures logged: a report's failures only grow, by its observer pass's, keeping those it had. */
const logged = new WeakSet<Report.Failure>();

/**
 * Logs what reports say failed, as they change: nothing else sees a tick's. The failures of a pass's observer systems
 * are added to its report after it, so the next pass logs them.
 */
export const logTickFailures = System.create({ name: "app/logTickFailures", observer: true, components: { read: [Report.failures], changed: [Report.failures] } }, row => {
    const fresh = row[Report.failures].filter(failure => !logged.has(failure));
    for (const failure of fresh) logged.add(failure);
    if (fresh.length > 0) console.error("A tick failed", fresh);
});
