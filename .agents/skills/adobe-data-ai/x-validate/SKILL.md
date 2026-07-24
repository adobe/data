---
name: x-validate
description: validates nested or piped function calls to determine if output types match all required input types
input: piped function calls
options:
    log = true
output: boolean
---

for each nested or piped function pair {
    check that the output type matches the required input types of the next
}

if options.log then {
    log results to chat
}

return true if they all validate or false if they don't

# Log

If `options.log`, print the pipeline **in source order**: initial value, then each `/skill` **exactly as many times as it appears** in the expression. **Never** add or omit a `/skill` that is not in the source.

**Between steps:** After a literal or `/skill`, before the next `/skill`, print **one** indented line:

- **OK** — the type leaving the producer toward the next step.
- **Fail** — only `<output> != <input>` (what the producer emitted vs what the next step requires). **No** separate line for the output type alone; the mismatch line is the whole message between that pair.

Put that line **after** the producer (literal or `/skill`) and **before** the consumer’s `/skill`. Never put the failure summary under the consumer.

After the first rejection, list remaining `/skill` lines from the source; each gets `—` as its only indented line (unreachable).

## Examples

2 | /x-double |> /x-double |> /x-log

2
  number
/x-double
  number
/x-double
  number
/x-log

"foo" | /x-double |> /x-double |> /x-log

"foo"
  string != number
/x-double
  —
/x-double
  —
/x-log
  —

12 | /x-double |> /x-alpha |> /x-double |> /x-log

12
  number
/x-double
  number
/x-alpha
  string != number
/x-double
  —
/x-log
  —
