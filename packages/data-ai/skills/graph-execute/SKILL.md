---
name: graph-execute
description: executes a graph of steps
input: piped function calls
---

The input is a set of piped function calls where each call is represented by a slash skill invocation.

Each step must be completed independently before moving on to the next.

The output of each phase is generally either a returned result or written to the file system. You can pass some context including any previous result to the next phase, but you must never read the subsequent phases in advance.

Call each of these phases in a subagent so that they are not even aware that future phases will take place.
