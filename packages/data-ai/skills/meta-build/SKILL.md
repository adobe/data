---
name: meta-build
description: Iteratively build an application or game phase-by-phase in clean subagents, reviewing each phase and refining the build-* skills / rules until each is optimal, then summarizing.
input: a prompt describing the application or game to build
options:
    target = build-application   # build command to exercise: build-application | build-game | build-feature | a single build-<phase>
    maxIterations = 4            # attempts per phase before moving on
---

Purpose: exercise and **polish the build-* skills and the rules they reference**, using
a concrete app/game prompt as the test case. You are improving the *general* guidance,
not the one-off output.

## Procedure

1. Resolve `target` to its **ordered phases**. A composite target expands to its pipe —
   `build-feature` → its `/build-*` layer steps; `build-application` / `build-game` →
   `build-feature` for the base and each peer, then `build-app-entry`. A single
   `build-<phase>` target is just that one phase.

2. For each phase, in order:
   a. **Run it in a fresh subagent** with constrained context (`/x-subagent`): give the
      subagent only the phase skill (`/<phase>`), the app/game prompt, and the files on
      disk from prior phases — nothing about this loop or earlier attempts, so every
      re-run differs only by any edits you made to the guidance.
   b. **Review** the phase output in a subagent with `/review`.
   c. If `/review` is not OPTIMAL: fix the **root cause in the guidance** — edit the
      phase skill or a rule it references. Keep every edit **concise and general**:
      improve it for all apps, never encode anything specific to this prompt. (For a
      pure `code` slip with sound guidance, just re-run.) Do **not** hand-patch the
      generated code.
   d. Re-run from (a), up to `maxIterations` (default 4) attempts. Move to the next
      phase once it reviews OPTIMAL — or the cap is hit (record that it did not converge).
   e. Record: the phase, its iteration count, and every skill/rule file you edited.

3. **Final review** (read-only): run `/review` over the whole product. **Change nothing.**
   Then summarize:
   - per-phase iteration counts,
   - which phase skills and which rules were edited, and why,
   - overall outcome (which phases converged, which hit the cap).

Every phase runs in its own constrained subagent so re-executions during polishing stay
consistent — the edited skill/rule is the only variable between a phase's attempts.
