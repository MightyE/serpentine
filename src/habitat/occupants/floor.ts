/**
 * The living floor: one enclosure's worth of animals, and the single loop that drives all of them.
 *
 * ## One `requestAnimationFrame` for the whole screen
 *
 * Not one per enclosure and certainly not one per animal. Nine loops means the browser
 * interleaving nine callbacks a frame, nine `dt` values that disagree, and nine chances for one
 * of them to be left running after its component unmounts. {@link floorAnimator} is a module-level
 * singleton that every {@link LivingHabitat} registers with and deregisters from, and it stops
 * itself when the last one leaves.
 *
 * ## The performance budget is fixed by the game, not by this file
 *
 * A habitat holds one animal per grid cell, so the whole floor has a hard ceiling — nine on the
 * starting three-by-three room. That is what makes a per-frame full redraw affordable at all, and
 * it is why the work here is bounded by design rather than by a quality setting somebody has to
 * remember to lower. {@link FloorAnimator.stats} reports what a frame actually costs; the habitat
 * lab prints it.
 *
 * Three things are not animated, and each of them is a real saving rather than a nicety:
 *
 * - **A hidden tab.** `requestAnimationFrame` already stops, but `document.hidden` is checked so
 *   a throttled-but-not-stopped frame does not run the simulation either.
 * - **An enclosure scrolled off screen.** An `IntersectionObserver` per canvas; off-screen
 *   enclosures freeze where they are and pick up again when they come back.
 * - **`prefers-reduced-motion`.** The loop is never started. Every animal is drawn once, resting
 *   in its coil, and the screen is completely usable — the snakes are still selectable, still
 *   pickable up, still labelled.
 */

import type { EnclosureView } from '../compose'
import { buildEnclosureArt, type EnclosureArt } from './enclosure'
import { HabitatOccupant, occupantScale, type OccupantSpec } from './occupant'
import type { Bounds } from '../../render/locomotion'

/** Longest step ever simulated. A tab that was in the background loses time rather than teleporting. */
const MAX_DT = 1 / 30

/**
 * How much of the enclosure the animals actually use, as insets in fractions of the rect.
 *
 * The top and bottom are larger because the tile puts a name over the art and a row of controls
 * under it. An animal is allowed to be partly behind those — it is a scrim, not a wall — but its
 * *destinations* should not be, or it would spend its life parked under the furniture caption.
 */
const USABLE = { left: 0.07, right: 0.07, top: 0.15, bottom: 0.25 }

export interface LivingHabitatOptions {
  /** Everything except `rect`, which is measured from the canvas. */
  readonly enclosure: Omit<EnclosureView, 'rect'>
  readonly occupants: readonly OccupantSpec[]
  /** No ambient motion. Draws one resting frame and never asks for another. */
  readonly still?: boolean
  /** Called when a click lands on an animal, or on nothing. */
  readonly onPick?: (id: string | null) => void
}

export class LivingHabitat {
  private readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private options: LivingHabitatOptions
  private art: EnclosureArt | null = null
  private occupants: HabitatOccupant[] = []
  private hotspots = new Map<string, HTMLElement>()
  private selected: string | null = null

  private width = 0
  private height = 0
  private dpr = 1
  private onScreen = true
  private readonly resizeObserver: ResizeObserver | null
  private readonly intersectionObserver: IntersectionObserver | null
  private readonly onClick: (event: MouseEvent) => void

  constructor(canvas: HTMLCanvasElement, options: LivingHabitatOptions) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.options = options

    this.onClick = (event) => {
      const point = this.toCanvas(event.clientX, event.clientY)
      const hit = this.occupants.find((o) => o.hits(point.x, point.y))
      options.onPick?.(hit ? hit.id : null)
    }
    canvas.addEventListener('click', this.onClick)

    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.measure())
    this.resizeObserver?.observe(canvas)

    this.intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) this.onScreen = entry.isIntersecting
          })
    this.intersectionObserver?.observe(canvas)

    this.measure()
    if (!options.still) floorAnimator.add(this)
  }

  get visible(): boolean {
    return this.onScreen
  }

  get population(): number {
    return this.occupants.length
  }

  /** Which animals live here now. Rebuilt when one moves in or out; cheap, and it happens rarely. */
  setOccupants(specs: readonly OccupantSpec[]): void {
    this.options = { ...this.options, occupants: specs }
    this.rebuildOccupants()
    this.render()
  }

  setSelected(id: string | null): void {
    if (this.selected === id) return
    this.selected = id
    this.render()
  }

  /**
   * Hand over the focusable element that stands in for one animal.
   *
   * The animals live on a canvas, which a keyboard cannot reach and a screen reader cannot see.
   * So each one has a real `<button>` positioned over its head, moved by this class rather than
   * by React state — a transform written straight to the element costs nothing, and re-rendering
   * a component tree sixty times a second to move nine buttons would cost a great deal.
   */
  attachHotspot(id: string, element: HTMLElement | null): void {
    if (element) this.hotspots.set(id, element)
    else this.hotspots.delete(id)
    this.placeHotspots()
  }

  /** Advance and redraw. Called by {@link FloorAnimator}; do not call it yourself. */
  tick(dt: number): void {
    if (!this.onScreen) return
    for (const occupant of this.occupants) occupant.update(dt)
    this.render()
    this.placeHotspots()
  }

  destroy(): void {
    floorAnimator.remove(this)
    this.canvas.removeEventListener('click', this.onClick)
    this.resizeObserver?.disconnect()
    this.intersectionObserver?.disconnect()
    this.hotspots.clear()
  }

  // -------------------------------------------------------------------------

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const changed = rect.width !== this.width || rect.height !== this.height || dpr !== this.dpr
    this.width = rect.width
    this.height = rect.height
    this.dpr = dpr

    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.ctx = this.canvas.getContext('2d')
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (changed || !this.art) {
      this.art = buildEnclosureArt(
        { ...this.options.enclosure, rect: { x: 0, y: 0, width: rect.width, height: rect.height } },
        dpr,
      )
      this.rebuildOccupants()
    }
    this.render()
  }

  /** The rectangle the animals may treat as floor. */
  private area(): Bounds {
    return {
      x: this.width * USABLE.left,
      y: this.height * USABLE.top,
      width: this.width * (1 - USABLE.left - USABLE.right),
      height: this.height * (1 - USABLE.top - USABLE.bottom),
    }
  }

  private rebuildOccupants(): void {
    if (!this.width || !this.height) return
    const area = this.area()
    const obstacles = this.art?.obstacles ?? []
    const existing = new Map(this.occupants.map((o) => [o.id, o]))

    const many = this.options.occupants.length
    this.occupants = this.options.occupants.map((spec, index) => {
      const kept = existing.get(spec.id)
      if (kept) {
        // Kept rather than rebuilt, so a snake that has simply had a birthday — or whose
        // enclosure gained a feature — does not snap back into a fresh coil in the middle.
        kept.reframe(area, obstacles)
        kept.setAge(spec.age)
        return kept
      }
      return new HabitatOccupant(spec, {
        area,
        obstacles,
        scale: occupantScale({ x: 0, y: 0, width: this.width, height: this.height }, spec.phenotype),
        home: startingPlace(area, index, many),
        still: this.options.still,
      })
    })
  }

  private render(): void {
    const ctx = this.ctx
    const art = this.art
    if (!ctx || !art) return
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.drawImage(art.behind, 0, 0, this.width, this.height)
    for (const occupant of this.occupants) occupant.draw(ctx, occupant.id === this.selected)
    ctx.drawImage(art.inFront, 0, 0, this.width, this.height)
  }

  private placeHotspots(): void {
    if (this.hotspots.size === 0) return
    for (const occupant of this.occupants) {
      const element = this.hotspots.get(occupant.id)
      if (!element) continue
      const head = occupant.headPosition
      const size = Math.max(22, occupant.girth * 2.4)
      element.style.width = `${size}px`
      element.style.height = `${size}px`
      element.style.transform = `translate(${head.x - size / 2}px, ${head.y - size / 2}px)`
    }
  }

  private toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
}

/**
 * The one loop.
 *
 * `stats` is not debug scaffolding to be deleted — the habitat lab reports it, and it is how the
 * "the occupancy limits set a ceiling on performance overhead" claim stays a measured fact rather
 * than an assumption that quietly stopped being true.
 */
export class FloorAnimator {
  private readonly views = new Set<LivingHabitat>()
  private running = false
  private last = 0
  private handle = 0

  /** Exponentially smoothed cost of the simulate-and-draw work in one frame, in milliseconds. */
  private smoothed = 0
  private worst = 0
  private frames = 0

  add(view: LivingHabitat): void {
    this.views.add(view)
    this.start()
  }

  remove(view: LivingHabitat): void {
    this.views.delete(view)
    if (this.views.size === 0) this.stop()
  }

  get stats(): {
    readonly enclosures: number
    readonly animals: number
    readonly frames: number
    /** Smoothed milliseconds of work per frame, across every visible enclosure. */
    readonly frameMs: number
    /** Worst single frame since the last {@link resetStats}. */
    readonly worstMs: number
  } {
    let animals = 0
    for (const view of this.views) animals += view.population
    return {
      enclosures: this.views.size,
      animals,
      frames: this.frames,
      frameMs: this.smoothed,
      worstMs: this.worst,
    }
  }

  resetStats(): void {
    this.smoothed = 0
    this.worst = 0
    this.frames = 0
  }

  private start(): void {
    if (this.running || typeof requestAnimationFrame === 'undefined') return
    this.running = true
    this.last = performance.now()
    this.handle = requestAnimationFrame(this.frame)
  }

  private stop(): void {
    this.running = false
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.handle)
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return
    const dt = Math.min(MAX_DT, (now - this.last) / 1000)
    this.last = now

    if (typeof document === 'undefined' || !document.hidden) {
      const started = performance.now()
      for (const view of this.views) view.tick(dt)
      const cost = performance.now() - started
      // 0.1 smoothing: settles in about a second, which is short enough to notice a regression
      // while reading the number and long enough that it is not a blur.
      this.smoothed = this.frames === 0 ? cost : this.smoothed + (cost - this.smoothed) * 0.1
      if (cost > this.worst) this.worst = cost
      this.frames++
    }

    this.handle = requestAnimationFrame(this.frame)
  }
}

export const floorAnimator = new FloorAnimator()

/**
 * Where the nth of `many` animals is first found, spread across the enclosure.
 *
 * Without this every occupant of a shared enclosure seeds its starting coil on the exact centre
 * and the first frame after a page load is a knot. They untangle within seconds either way, but
 * the first impression is the one that reads as broken.
 */
function startingPlace(area: Bounds, index: number, many: number): { x: number; y: number } {
  const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  if (many <= 1) return centre
  const angle = (index / many) * Math.PI * 2
  const reach = Math.min(area.width, area.height) * 0.24
  return { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach }
}

/** Whether the viewer has asked for less motion. Read once per mount, not cached forever. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
