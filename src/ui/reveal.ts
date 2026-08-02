/**
 * The reveal: wrapped → tension → tear → flip → the snake comes alive, escapes its frame, returns,
 * poses, and **freezes into print**.
 *
 * ## The steady state is the load-bearing half
 *
 * Once the animation ends the snake is a completely static image inside the card boundary, with no
 * ongoing motion whatsoever — as if the card were printed on card stock and the snake were ink on
 * it. No idle breathing, no loop. A card with a permanently animating portrait reads as a video
 * player in a frame; a card that is *static* at rest reads as a physical printed thing you own,
 * which is the whole collectible feeling the card system is chasing.
 *
 * It is also the cheap option, which is rare and worth taking: a binder full of animating snakes is
 * a frame-rate cliff, so the portrait cache becomes the normal path and the expensive live renderer
 * runs only during one reveal at a time.
 *
 * ## Two paths, and the second one is deliberately boring
 *
 * First ever view: wrapper, tension build, tear, flip, confetti, escape. Every later view: a quick
 * flip to the printed card, no tension, no confetti, never an escape. Spectacle that happens every
 * time is not spectacle, it is the baseline, and it stops being noticed within an afternoon.
 * "Seen" survives a reload — see {@link hasSeen}.
 *
 * ## Escape is rare and opt-in
 *
 * `data-escape` on the card root opts an animal in (`none` by default). Tier raises the ceiling on
 * how far an opted-in escape may go and **never triggers one**, so a Legendary with `none` still
 * reveals beautifully while staying politely inside its frame.
 *
 * `prefers-reduced-motion` skips all of it and goes straight to the settled static print.
 */
import { LifeSnakeView } from '../render/life'
import { renderPortrait } from '../render/portrait'
import type { Phenotype } from '../render/contract'

const SEEN_KEY = 'serpentine.seen.v1'

const reduced = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => window.setTimeout(r, reduced() ? Math.min(ms, 30) : ms))

// ---------------------------------------------------------------------------
// "Seen before" memory — persisted, because the whole point of the quick path is
// that the second time you open an animal it does not perform at you.
// ---------------------------------------------------------------------------

let seenCache: Set<string> | null = null

function seenSet(): Set<string> {
  if (seenCache) return seenCache
  seenCache = new Set()
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    if (raw) for (const id of JSON.parse(raw) as string[]) seenCache.add(id)
  } catch {
    // A blocked or full localStorage costs the player a repeated reveal, nothing more.
  }
  return seenCache
}

export function hasSeen(id: string): boolean {
  return seenSet().has(id)
}

export function markSeen(id: string): void {
  const set = seenSet()
  if (set.has(id)) return
  set.add(id)
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...set]))
  } catch {
    /* see above */
  }
  // Any other card showing the same animal — the one in the binder behind this overlay, say — is
  // now stale: it is face-down for an animal you have just met. Tell it to turn over.
  window.dispatchEvent(new CustomEvent('serpentine:seen', { detail: { id } }))
}

export function forgetSeen(): void {
  seenCache = new Set()
  try {
    window.localStorage.removeItem(SEEN_KEY)
  } catch {
    /* see above */
  }
}

// ---------------------------------------------------------------------------
// Escape geometry
// ---------------------------------------------------------------------------

export const ESCAPE_LEVEL: Readonly<Record<string, number>> = { none: 0, peek: 0.45, full: 1 }
export const TIER_CEIL: Readonly<Record<string, number>> = {
  common: 0.45,
  uncommon: 0.6,
  rare: 0.75,
  epic: 0.9,
  legendary: 1,
}
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary']

/** How far this card's escape may actually go: what it opted into, capped by its tier. */
export function escapeAmount(card: HTMLElement): number {
  const opted = ESCAPE_LEVEL[card.dataset.escape ?? 'none'] ?? 0
  const ceiling = TIER_CEIL[card.dataset.tier ?? 'common'] ?? 1
  return Math.min(opted, ceiling)
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// ---------------------------------------------------------------------------
// Canvas plumbing
// ---------------------------------------------------------------------------

const dprOf = (): number => Math.min(window.devicePixelRatio || 1, 2)

function fit(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const dpr = dprOf()
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w: rect.width, h: rect.height }
}

interface Parts {
  art: HTMLCanvasElement | null
  overlay: HTMLCanvasElement | null
  confetti: HTMLCanvasElement | null
  window: HTMLElement | null
}

function partsOf(card: HTMLElement): Parts {
  return {
    art: card.querySelector<HTMLCanvasElement>('canvas.snake-canvas'),
    overlay: card.querySelector<HTMLCanvasElement>('canvas.escape-canvas'),
    confetti: card.querySelector<HTMLCanvasElement>('canvas.fx-canvas'),
    window: card.querySelector<HTMLElement>('.art-window'),
  }
}

/**
 * FREEZE HANDOFF — the settled state.
 *
 * Draws the cached portrait once, into the art canvas, which is clipped by the art window. After
 * this call nothing about the card moves. `renderPortrait` memoises per phenotype and size, so a
 * binder of thirty cards is thirty `drawImage` calls and no re-renders.
 */
export function drawSettled(card: HTMLElement, phenotype: Phenotype, age: number): void {
  const { art } = partsOf(card)
  if (!art) return
  const sized = fit(art)
  if (!sized) return
  const { ctx, w, h } = sized
  ctx.clearRect(0, 0, w, h)
  const portrait = renderPortrait(phenotype, { width: w, height: h, pixelRatio: dprOf() })
  ctx.drawImage(portrait, 0, 0, w, h)
  void age
  card.dispatchEvent(
    new CustomEvent('serpentine:settled', { bubbles: true, detail: { snakeId: card.dataset.id } }),
  )
}

// ---------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------

/** Tier colours, read back out of the card's own computed style so `theme.css` stays the source. */
function tierColours(card: HTMLElement): string[] {
  const style = getComputedStyle(card)
  return ['--t3', '--t1', '--t2']
    .map((name) => style.getPropertyValue(name).trim())
    .filter(Boolean)
}

const CONFETTI_COUNT: Readonly<Record<string, number>> = {
  common: 16,
  uncommon: 34,
  rare: 60,
  epic: 100,
  legendary: 170,
}
const CONFETTI_SPREAD: Readonly<Record<string, number>> = {
  common: 3.2,
  uncommon: 4,
  rare: 4.8,
  epic: 5.6,
  legendary: 6.6,
}

function burst(card: HTMLElement): void {
  if (reduced()) return
  const { confetti } = partsOf(card)
  if (!confetti) return
  const sized = fit(confetti)
  if (!sized) return
  const { ctx, w, h } = sized
  const tier = card.dataset.tier ?? 'common'
  const colours = tierColours(card)
  const count = CONFETTI_COUNT[tier] ?? 16
  const spread = CONFETTI_SPREAD[tier] ?? 3.2

  const cx = w / 2
  const cy = h / 2
  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = (0.4 + Math.random()) * spread
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      w: 2 + Math.random() * 5,
      h: 3 + Math.random() * 8,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.008 + Math.random() * 0.012,
      colour: colours[(Math.random() * colours.length) | 0] ?? '#ffffff',
    }
  })

  const tick = (): void => {
    ctx.clearRect(0, 0, w, h)
    let alive = 0
    for (const p of parts) {
      if (p.life <= 0) continue
      alive += 1
      p.vy += 0.075
      p.vx *= 0.992
      p.vy *= 0.992
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life -= p.decay
      ctx.save()
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.colour
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (alive) requestAnimationFrame(tick)
    else ctx.clearRect(0, 0, w, h)
  }
  tick()
}

// ---------------------------------------------------------------------------
// "Comes alive", then freezes
// ---------------------------------------------------------------------------

/**
 * The live pass. Runs the real renderer for one card, for about a second, then hands off to the
 * static print and stops. Resolves once the card is frozen.
 *
 * When the card has opted into an escape the snake is drawn on the overlay canvas, which lives
 * outside every `overflow: hidden` layer, so it can cross the frame, the type and the card's own
 * edge. When it has not, exactly the same animation plays inside the art window and never leaves.
 */
async function animateAlive(card: HTMLElement, phenotype: Phenotype, age: number): Promise<void> {
  if (reduced()) {
    card.dataset.state = 'settled'
    drawSettled(card, phenotype, age)
    return
  }

  const { art, overlay, window: artWindow } = partsOf(card)
  if (!art || !artWindow) {
    card.dataset.state = 'settled'
    return
  }

  const amount = escapeAmount(card)
  const escaping = amount > 0 && overlay !== null
  const target = escaping ? overlay! : art

  card.dataset.state = 'revealing'
  card.dispatchEvent(
    new CustomEvent('serpentine:revealing', {
      bubbles: true,
      detail: { snakeId: card.dataset.id, escape: card.dataset.escape, amount },
    }),
  )

  const sized = fit(target)
  if (!sized) {
    card.dataset.state = 'settled'
    drawSettled(card, phenotype, age)
    return
  }
  const { ctx, w, h } = sized

  // Where the art window and the card sit, in the target canvas's own coordinates.
  const targetRect = target.getBoundingClientRect()
  const windowRect = artWindow.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  const win = {
    x: windowRect.left - targetRect.left,
    y: windowRect.top - targetRect.top,
    w: windowRect.width,
    h: windowRect.height,
  }
  const centre = {
    x: cardRect.left - targetRect.left + cardRect.width / 2,
    y: cardRect.top - targetRect.top + cardRect.height / 2,
  }

  // The renderer works in its own units — an adult is 300 logical pixels — so the view is built at
  // that scale and the context is scaled down to the window. Scaling the context rather than the
  // animal keeps every proportion honest.
  const zoom = win.w / 300
  const view = new LifeSnakeView(phenotype, {
    bounds: { x: 0, y: 0, width: win.w / zoom, height: win.h / zoom },
    age,
    pose: 'wander',
  })

  if (escaping) {
    const artSized = fit(art)
    artSized?.ctx.clearRect(0, 0, artSized.w, artSized.h)
  }

  const tierIndex = Math.max(0, TIERS.indexOf(card.dataset.tier ?? 'common'))
  const duration = 1000 + tierIndex * 170 + (escaping ? 420 * amount : 0)
  const start = performance.now()

  await new Promise<void>((done) => {
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      window.clearTimeout(guard)
      done()
    }
    // Wall-clock safety net: a throttled or hidden tab must still reach "settled".
    const guard = window.setTimeout(finish, duration + 600)
    let last = start

    const frame = (now: number): void => {
      if (finished) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = Math.min(1, (now - start) / duration)

      // escape out (0–.30) → hold and coil (.30–.56) → flow back (.56–1)
      let p: number
      if (t < 0.3) p = easeOutCubic(t / 0.3)
      else if (t < 0.56) p = 1
      else p = 1 - easeInOutCubic((t - 0.56) / 0.44)

      view.update(dt)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      if (escaping) {
        const grow = 1 + 1.05 * amount * p
        ctx.translate(centre.x, centre.y)
        ctx.rotate(0.22 * amount * p * Math.sin(t * 3.1))
        ctx.scale(grow, grow)
        ctx.translate(-centre.x, -centre.y)
      }
      ctx.translate(win.x, win.y)
      ctx.scale(zoom, zoom)
      view.draw(ctx)
      ctx.restore()

      if (t < 1) requestAnimationFrame(frame)
      else finish()
    }
    requestAnimationFrame(frame)
  })

  card.dataset.state = 'settling'
  drawSettled(card, phenotype, age)
  if (escaping && overlay) {
    // Let the overlay hand off for a couple of frames, then clear it. Not awaited: the state
    // machine must not be gated on a timer.
    window.setTimeout(() => {
      const again = fit(overlay)
      again?.ctx.clearRect(0, 0, again.w, again.h)
    }, 200)
  }
  card.dataset.state = 'settled' // STATIC. No idle loop, no breathing.
}

// ---------------------------------------------------------------------------
// The two paths
// ---------------------------------------------------------------------------

export function faceDown(card: HTMLElement): void {
  card.classList.remove('is-revealed', 'is-charging', 'is-tearing', 'fx-pop', 'flip-quick', 'is-wrapped')
  card.dataset.state = 'facedown'
  const { overlay } = partsOf(card)
  if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height)
}

const busy = new WeakSet<HTMLElement>()

export async function reveal(card: HTMLElement, phenotype: Phenotype, age: number): Promise<void> {
  if (busy.has(card)) return
  const id = card.dataset.id ?? ''
  busy.add(card)
  try {
    if (!hasSeen(id)) {
      await firstReveal(card, phenotype, age)
      markSeen(id)
    } else {
      await quickReveal(card, phenotype, age)
    }
  } finally {
    busy.delete(card)
  }
}

/** PATH 1 — first ever: wrapped, tension, tear, flip, celebrate, come alive. */
async function firstReveal(card: HTMLElement, phenotype: Phenotype, age: number): Promise<void> {
  const tierIndex = Math.max(0, TIERS.indexOf(card.dataset.tier ?? 'common'))
  faceDown(card)
  card.classList.add('is-wrapped')
  await sleep(220)
  card.classList.add('is-charging')
  await sleep(900 + tierIndex * 220) // a longer build for a higher tier
  card.classList.remove('is-charging')
  card.classList.add('is-tearing')
  await sleep(260)
  card.classList.add('is-revealed')
  card.dataset.state = 'flipping'
  await sleep(300)
  card.classList.remove('is-wrapped', 'is-tearing')
  card.classList.add('fx-pop')
  burst(card)
  if (tierIndex >= 3 && !reduced()) {
    await sleep(260)
    burst(card)
  }
  card.classList.remove('fx-pop')
  await animateAlive(card, phenotype, age)
}

/** PATH 2 — every later view: a clean quick flip to the static print. */
async function quickReveal(card: HTMLElement, phenotype: Phenotype, age: number): Promise<void> {
  faceDown(card)
  card.classList.add('flip-quick')
  await sleep(60)
  card.classList.add('is-revealed')
  card.dataset.state = 'flipping'
  await sleep(reduced() ? 30 : 440)
  card.dataset.state = 'settled'
  drawSettled(card, phenotype, age)
}

// ---------------------------------------------------------------------------
// Pointer-reactive foil and tilt
// ---------------------------------------------------------------------------

/**
 * `--shine` (0..1) is the "catching the light" amount. It swells with how far the pointer is from
 * centre *and* how fast it is moving, then eases back to zero when the pointer stops or leaves. At
 * rest the card is clean: iridescence about a fiftieth of full, glitter exactly zero, glow still
 * on — because a glowing snake should glow.
 *
 * Returns its own teardown.
 */
export function wirePointer(card: HTMLElement): () => void {
  const state = { shine: 0, target: 0, last: 0, px: 0.5, py: 0.5, hover: false, raf: 0, written: -1 }

  const write = (v: number): void => {
    if (Math.abs(v - state.written) < 0.004) return
    state.written = v
    card.style.setProperty('--shine', v.toFixed(3))
  }

  const loop = (): void => {
    const now = performance.now()
    if (!state.hover) state.target = 0
    else if (now - state.last > 70) state.target *= 0.9
    state.shine += (state.target - state.shine) * 0.14
    if (state.shine < 0.004 && state.target < 0.004) {
      state.shine = 0
      write(0)
      state.raf = 0
      return
    }
    write(state.shine)
    state.raf = requestAnimationFrame(loop)
  }
  const kick = (): void => {
    if (!state.raf) state.raf = requestAnimationFrame(loop)
  }

  const onEnter = (): void => {
    state.hover = true
    state.last = performance.now()
    kick()
  }

  const onMove = (e: PointerEvent): void => {
    const rect = card.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    card.style.setProperty('--mx', x.toFixed(3))
    card.style.setProperty('--my', y.toFixed(3))
    card.style.setProperty('--tilt-y', `${((x - 0.5) * 13).toFixed(2)}deg`)
    card.style.setProperty('--tilt-x', `${((0.5 - y) * 11).toFixed(2)}deg`)

    const now = performance.now()
    const dt = Math.max(8, now - (state.last || now))
    const moved = Math.hypot(x - state.px, y - state.py)
    const speed = Math.min(1, moved / (dt / 1000) / 1.6)
    const off = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / 0.5)
    state.target = Math.min(1, 0.34 * off + 1.15 * speed)
    state.px = x
    state.py = y
    state.last = now
    state.hover = true
    kick()
  }

  const rest = (): void => {
    state.hover = false
    state.target = 0
    card.style.setProperty('--mx', '0.5')
    card.style.setProperty('--my', '0.5')
    card.style.setProperty('--tilt-x', '0deg')
    card.style.setProperty('--tilt-y', '0deg')
    kick()
  }

  card.addEventListener('pointerenter', onEnter)
  card.addEventListener('pointermove', onMove)
  card.addEventListener('pointerleave', rest)
  card.addEventListener('pointercancel', rest)

  return () => {
    card.removeEventListener('pointerenter', onEnter)
    card.removeEventListener('pointermove', onMove)
    card.removeEventListener('pointerleave', rest)
    card.removeEventListener('pointercancel', rest)
    if (state.raf) cancelAnimationFrame(state.raf)
  }
}
