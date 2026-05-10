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
