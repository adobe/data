# model

What tests share of a world's ticks: waiting for the next one.

`watchTicks`, once before a world's first run, lets `nextTick` resolve after each of its ticks, and `settled` waits for
a run and the tick after it.
