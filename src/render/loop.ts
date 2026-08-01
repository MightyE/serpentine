/**
 * The animation loop, and getting a canvas to look sharp.
 *
 * ## One loop, not one per snake
 *
 * There is exactly one `requestAnimationFrame` loop for the whole app. Every snake gets
 * `update(dt)` called from it. Giving each snake its own loop would mean the browser
 * interleaving twenty separate callbacks per frame, each one doing its own layout work, and
 * they would drift out of step with each other.
 *
 * ## The `dt` clamp is not optional
 *
 * Switch to another browser tab and come back, and the gap since the last frame can be
 * *minutes*. Feed that number into the physics and every snake teleports across the screen —
 * or, worse, the catch-up work takes so long that the next gap is even bigger. Clamping `dt`
 * means the animation quietly loses a few seconds instead, which nobody notices.
 */

/** Longest step we will ever simulate: 1/30s. Anything bigger is a tab that was in the background. */
const MAX_DT = 1 / 30

export type FrameCallback = (dt: number, time: number) => void

/**
 * Start the loop. Returns a function that stops it.
 *
 * @param onFrame called once per frame with the seconds elapsed (clamped) and the total
 *   seconds since the loop started.
 */
export function startRenderLoop(onFrame: FrameCallback): () => void {
  let running = true
  let last = performance.now()
  let elapsed = 0

  const frame = (now: number): void => {
    if (!running) return
    const dt = Math.min(MAX_DT, (now - last) / 1000)
    last = now
    elapsed += dt
    onFrame(dt, elapsed)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  return () => {
    running = false
  }
}

/**
 * Match the canvas's pixel buffer to its on-screen size *and* the screen's pixel density.
 *
 * On a laptop with a high-density display, one CSS pixel is four real ones. A canvas that
 * ignores this is drawn at quarter resolution and then blown up, which is why hand-rolled
 * canvas graphics so often look faintly blurry next to everything else on the page.
 *
 * The transform is set **here, on resize** — never per frame. After this call, every drawing
 * function in the renderer can work in plain CSS pixels and never think about density again.
 *
 * @returns true if the size changed, in case the caller wants to rebuild anything.
 */
export function fitCanvasToDisplay(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width === width && canvas.height === height) return false
  canvas.width = width
  canvas.height = height
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return true
}
