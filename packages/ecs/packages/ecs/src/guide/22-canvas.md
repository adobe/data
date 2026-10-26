# Drawing on a canvas

The same particles, drawn in immediate mode: each frame, the canvas is cleared and drawn again whole.

[`draw`](22-canvas.ts#L52-L80) is one observer without components, so it runs once per tick, not per particle.

- `changed: [clock]` runs it after every tick, and `is: [pen]` waits for a 2D context.
- It reads every particle through [an index without a key](22-canvas.ts#L50-L51), `key: []`, and the traced one
  through a second.
- It sizes the canvas's pixels to its size on the page, then calls `clearRect(`, and `arc(` and `fill()` for each
  particle.

Without a page, the stand-in keeps the circles filled since it was last cleared, and its `getImageData(` answers
whether a pixel is covered, as a canvas does. So the program checks that the traced particle is drawn, frame by
frame, the same in node and on the page.
