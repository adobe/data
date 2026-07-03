# @adobe/data-ai

Cross-agent architecture skills for [`@adobe/data`](https://www.npmjs.com/package/@adobe/data). One skill bundle, authored once, distributed two ways.

Skills version in lockstep with the library: `@adobe/data-ai@x.y.z` describes `@adobe/data@x.y.z`.

## Install (any agent)

The installer copies the flat skill folders into whichever skill roots your project's agents scan. It is idempotent and version-stamped — commit the result, and re-run to refresh.

```sh
npx @adobe/data-ai@latest install
```

This writes:

| Root | Agent | Notes |
| --- | --- | --- |
| `.claude/skills/<name>/` | Claude Code | No recursion — skills must be flat. |
| `.agents/skills/<name>/` | Cursor, Codex | Tool-neutral; other Agent-Skills agents pick these up. |

Options:

```sh
npx @adobe/data-ai@latest install --claude     # only .claude/skills
npx @adobe/data-ai@latest install --agents     # only .agents/skills (alias: --cursor)
npx @adobe/data-ai@latest install --global      # into ~/.claude, ~/.agents
npx @adobe/data-ai@latest install --dir=./sub   # into a specific base dir
npx @adobe/data-ai@latest list                  # show bundled skills
```

Each root gets a `.data-ai.json` manifest recording which skills this package owns, so a re-run prunes skills we no longer ship without touching skills you added yourself.

## Install (Claude Code plugin)

Claude users can instead consume the skills as a native plugin from the `adobe/data` marketplace — no npm needed.

Interactive:

```
/plugin marketplace add adobe/data
/plugin install adobe-data-ai@adobe-data-skills
```

Or declaratively, so collaborators are prompted to auto-install on next launch — commit to your repo's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "adobe-data-skills": {
      "source": { "source": "github", "repo": "adobe/data" }
    }
  },
  "enabledPlugins": {
    "adobe-data-ai@adobe-data-skills": true
  }
}
```

The plugin cache is version-hashed and garbage-collected, so it is not a stable path to symlink against — prefer the `npx … install` copy model when you need a durable, cross-agent artifact.

---

# Pragmatic Programming

## Target Audience

Software engineers who want to build high quality applications with a sustainable velocity.

## Goals

The goal of effective software engineers is to generate a high rate of value per unit time.

    rate = value / time

We can improve the rate by either increasing value or decreasing time.

- Quality: Write better applications. ▲value
- Velocity: Write applications faster. ▼time

### Code Priorities

1. Correct: Does the job. This one is non-negotiable.
2. Clear: Easily understood by both humans and AI.
3. Changeable: Quickly and safely modified or extended.

There is occasionally some tension between clarity and changeability. More abstraction or generic parameters may make things more changeable at the cost of some clarity.

### Code Challenges

- Complexity: Undermines every single one of our code priorities.

Complexity is the limiting factor which defines the upper limit on how sophisticated of an application we are able to create and maintain at a practical velocity.

The difficulty of dealing with complexity tends to increase at a greater than linear rate, especially once the short term context window of a human or ai agent is exceeded.

### General Principles

- Separation of Concerns: If two concerns can be separated then do it.
- Avoid mutation: Immutable values are easier to reason about.
- Use Small files: Aim for less than 200 loc. Decompose if > 500 loc.
- Single concern per file: Export only a single declaration per file.
- Avoid object oriented classes: Combines data concerns with functions.
- Distinguish services from data: Services do things, data stores things.
- Use static typing: Finds errors earlier and guides both AI and humans.
- Avoid side effects: Pure functions are easier to comprehend and test.
