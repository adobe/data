---
name: x-execute
description: executes an input optionally with validate first
input: piped function calls
options:
    validate = true
output: input.output
---

if options.validate && not /x-validate input {
  return "Invalid not executed"
}
else {
  return evaluate input
}

