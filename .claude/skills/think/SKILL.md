---
name: think
description: Reflective Thought Composition. Structured thinking pipeline for complex decisions, design evaluation, and deep analysis. Use when quality of reasoning matters more than speed of response.
---

# think

Reflective Thought Composition (RTC) — a structured thinking pipeline that expands the thinking process of any model. Adapted from paralleldrive/aidd `aidd-rtc`.

```
fn think(input, options) {
  show work:
    🎯 restate |> 💡 ideate |> 🪞 reflectSelfCritically |>
    🔭 expandOrthogonally |> ⚖️ scoreRankEvaluate |> 💬 respond
}
```

Commands {
  /think [--compact] [--depth N] [prompt]  Reflective Thought Composition — think deeply and critically over multiple reasoning paths prior to responding.
}

Options {
  --compact  🗜️🐘🤔💭 Compress thinking: SPR🧠 associative. Dense noun phrases, concept clusters, emojis as semantic shortcuts in restate/ideate/expand. Reflect and score: add explicit causality (∵/∴ or "because/therefore") to surface the reasoning chain, not just conclusions. Every internal stage: load-bearing tokens only, no filler. 💬Respond = full natural language, standalone, structured.
  --depth -d [1..10] (default: 10)  Response density. 1 = a few words per step, 10 = several bullet points per step.
}

## The stages

- 🎯 **restate** — restate the problem in your own words; surface the real goal and constraints.
- 💡 **ideate** — generate candidate approaches/answers, breadth over polish.
- 🪞 **reflectSelfCritically** — attack your own ideas; name failure modes, hidden assumptions, where each breaks.
- 🔭 **expandOrthogonally** — pull in adjacent angles the first pass missed (different axis, different layer, different stakeholder).
- ⚖️ **scoreRankEvaluate** — score/rank the candidates against the constraints with explicit causal reasoning (because → therefore), not bare verdicts.
- 💬 **respond** — the final answer in full natural language: standalone, structured, no reference to the internal stages.

## When to use each option

```
(thinking itself is the goal — improving reasoning quality) => /think --compact
(communicating depth to the user is the goal)              => /think --depth N
(both)                                                     => /think --compact --depth N
```

`--compact` is for internal reasoning passes where the output feeds another step, not directly to the user. Think deeply but compactly — every token earns its place. Switch to natural language at 💬 respond.

**Pass:** remove any word → lose meaning. Reflect/score show explicit causal chain, not just conclusions.
**Fail:** consultant prose. Hedging. Filler. Conclusions without reasoning. Polish before the respond stage.
