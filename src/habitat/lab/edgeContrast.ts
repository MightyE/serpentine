/**
 * The edge-contrast probe: does the animal have a visible outline, and how visible?
 *
 * A snake reported as "see-through" is almost never translucent — `paintBody` lays an opaque
 * undercoat before anything else. It looks translucent when its *edge* and the substrate behind it
 * land at the same brightness, because then there is no silhouette to read. That is a measurable
 * quantity, so it is measured here rather than argued about.
 *
 * Two measurements, both on a flat substrate fill (no wash, no glare, no lighting pass — those
 * modulate the substrate and would smear the reading across the biome rather than isolating the
 * edge):
 *
 * - **B — edge contrast.** Weber contrast between the animal's rim band and the ring of substrate
 *   just outside it, per fixture per substrate colour, plus the rim-vs-core delta that says which
 *   way the tube-rounding illusion is pointing.
 * - **D — contact-shadow sweep.** The same worst-case number over a grid of
 *   {@link CONTACT_SHADOW_PASSES} alphas, so the shipped pair can be checked against its
 *   neighbours instead of trusted.
 *
 * Open `edge-contrast-probe.html`. Everything is driven from `window.edgeContrastProbe` as well,
 * so a headless browser can print the tables without a human squinting at them.
 */

import '../../render'
import type { Phenotype, Rgba } from '../../render/contract'
import { luminance, rgba, toCss } from '../../render/colour'
import { FIXTURES } from '../../render/lab/fixtures'
import { cypressMargin } from '../biomes/cypressMargin'
import { RIM_SHADE } from '../../render/life/paint'
import { CONTACT_SHADOW_PASSES, HabitatOccupant, occupantScale } from '../occupants/occupant'

/**
 * The measured canvas, in logical pixels — about the size of one enclosure tile on the store
 * floor. Measured at `dpr` 2, because the rim is `width × 0.16` thick and on a small animal that
 * is barely two logical pixels: at `dpr` 1 the band being measured is one pixel wide and the
 * reading is mostly antialiasing. `floor.ts` draws through `setTransform(dpr, …)` and nothing
 * else, so this is the same geometry a retina screen actually rasterises, at twice the samples.
 */
const WIDTH = 260
const HEIGHT = 220
const DPR = 2

/** The four fixtures the rim has to work for: two dark bases, one mid, one nearly white. */
const FIXTURE_LABELS = [
  'Starlight (invented)',
  'Garter — striped',
  'Ball python — wild type',
  'Hognose — superarctic',
] as const

/** The two flat substrate colours of the darkest shipped biome. */
const SUBSTRATES: readonly { label: string; colour: Rgba }[] = [
  { label: 'cypress', colour: cypressMargin.palette.substrate },
  { label: 'cypress-dark', colour: cypressMargin.palette.substrateDark },
]

export interface EdgeReading {
  readonly fixture: string
  readonly substrate: string
  /** Mean luminance, 0–255, of the band the rim stroke lands in. */
  readonly rim: number
  /** Mean luminance of the body well inside the rim. */
  readonly core: number
  /** Mean luminance of the substrate ring just outside the silhouette. */
  readonly surround: number
  /** `|rim − surround| / max(rim, surround)`. Under ~0.10 a boundary stops reading as one. */
  readonly weber: number
  /** `rim − core`. Negative darkens the flanks, positive lightens them; near zero is a flat tube. */
  readonly relief: number
}

// ----------------------------------------------------------------------------------------------
// Rendering one case
// ----------------------------------------------------------------------------------------------

/** Device pixels. Every band width below is in logical pixels and scaled by {@link DPR}. */
const PIXEL_WIDTH = WIDTH * DPR
const PIXEL_HEIGHT = HEIGHT * DPR

function makeCanvas(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = PIXEL_WIDTH
  canvas.height = PIXEL_HEIGHT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('edge-contrast probe: no 2d context')
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  return ctx
}

function fixture(label: string): Phenotype {
  const found = FIXTURES.find((f) => f.label === label)
  if (!found) throw new Error(`edge-contrast probe: no fixture labelled ${label}`)
  return found
}

/**
 * One animal, adult, resting in its coil.
 *
 * `still` matters for more than motion: it is what makes the pose reproducible. The occupant is
 * never `update()`d, so `time` stays 0 and the mask render and the measured render are the same
 * animal in the same place down to the pixel.
 */
function makeOccupant(phenotype: Phenotype): HabitatOccupant {
  return new HabitatOccupant(
    { id: `probe-${phenotype.seed}`, phenotype, age: 1, name: 'probe' },
    {
      area: { x: WIDTH * 0.07, y: HEIGHT * 0.15, width: WIDTH * 0.86, height: HEIGHT * 0.6 },
      obstacles: [],
      scale: occupantScale({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, phenotype),
      home: { x: WIDTH / 2, y: HEIGHT / 2 },
      still: true,
    },
  )
}

/**
 * Run `body` with the contact shadow configured to `passes`, then put the shipped ones back.
 *
 * `passes` is copied *before* the live array is emptied, because the most natural call in the file
 * — "measure with whatever is shipped" — hands in `CONTACT_SHADOW_PASSES` itself, and truncating
 * the argument you are about to read leaves you measuring an animal with no shadow at all while
 * the table says otherwise.
 */
function withShadowPasses<T>(passes: readonly [number, number, number, number][], body: () => T): T {
  const wanted = passes.map((p) => [...p] as [number, number, number, number])
  const shipped = CONTACT_SHADOW_PASSES.slice()
  CONTACT_SHADOW_PASSES.length = 0
  CONTACT_SHADOW_PASSES.push(...wanted)
  try {
    return body()
  } finally {
    CONTACT_SHADOW_PASSES.length = 0
    CONTACT_SHADOW_PASSES.push(...shipped)
  }
}

// ----------------------------------------------------------------------------------------------
// Finding the edge
// ----------------------------------------------------------------------------------------------

/**
 * Distance from every pixel to the nearest `seed` pixel, by two-pass chamfer.
 *
 * Approximate Euclidean — good to a few percent, which is far finer than the bands below need,
 * and it is two linear passes rather than a Voronoi build.
 */
function chamfer(seed: Uint8Array, width: number, height: number): Float32Array {
  const far = width + height
  const d = new Float32Array(width * height)
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : far
  const diagonal = Math.SQRT2

  const relax = (at: number, from: number, cost: number): void => {
    const candidate = d[from] + cost
    if (candidate < d[at]) d[at] = candidate
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x
      if (y > 0) {
        relax(at, at - width, 1)
        if (x > 0) relax(at, at - width - 1, diagonal)
        if (x < width - 1) relax(at, at - width + 1, diagonal)
      }
      if (x > 0) relax(at, at - 1, 1)
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const at = y * width + x
      if (y < height - 1) {
        relax(at, at + width, 1)
        if (x < width - 1) relax(at, at + width + 1, diagonal)
        if (x > 0) relax(at, at + width - 1, diagonal)
      }
      if (x < width - 1) relax(at, at + 1, 1)
    }
  }
  return d
}

/**
 * Where the animal is: the body alone, with the contact shadow switched off.
 *
 * Drawn onto a transparent canvas and thresholded at near-full alpha. The glow effect draws behind
 * the body at 5–12% alpha, so it never reaches the threshold — the mask is the opaque body and
 * nothing else, which is exactly the silhouette `traceRibbon` filled.
 */
function silhouette(occupant: HabitatOccupant): Uint8Array {
  const ctx = withShadowPasses([], () => {
    const c = makeCanvas()
    occupant.draw(c, false)
    return c
  })
  const pixels = ctx.getImageData(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT).data
  const mask = new Uint8Array(PIXEL_WIDTH * PIXEL_HEIGHT)
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] >= 250 ? 1 : 0
  return mask
}

function meanLuminance(pixels: Uint8ClampedArray, take: (index: number) => boolean): number {
  let total = 0
  let count = 0
  for (let i = 0; i < PIXEL_WIDTH * PIXEL_HEIGHT; i++) {
    if (!take(i)) continue
    total += luminance({ r: pixels[i * 4], g: pixels[i * 4 + 1], b: pixels[i * 4 + 2], a: 1 }) * 255
    count++
  }
  return count === 0 ? NaN : total / count
}

// ----------------------------------------------------------------------------------------------
// Measurement B — edge contrast
// ----------------------------------------------------------------------------------------------

/**
 * Where each band sits, in **logical** pixels from the silhouette.
 *
 * The rim stroke is centred on the outline and clipped to the inside, so it shades a band
 * `lineWidth / 2` deep — which is where the rim band ends. The mask threshold has already dropped
 * every partly-covered boundary pixel to "outside", so the outermost pixel of the mask is a fully
 * covered body pixel and the rim band can start right at it. The substrate ring starts a pixel out
 * for the same reason from the other side.
 */
const SURROUND_START = 1
const SURROUND_END = 3
const CORE_MARGIN = 1

/** Everything about one animal that does not change when the substrate or the shadow does. */
interface Subject {
  readonly occupant: HabitatOccupant
  readonly mask: Uint8Array
  readonly depthIn: Float32Array
  readonly depthOut: Float32Array
  /** How deep the rim stroke reaches, in device pixels. */
  readonly rimDepth: number
}

function subjectFor(phenotype: Phenotype): Subject {
  const occupant = makeOccupant(phenotype)
  const mask = silhouette(occupant)
  const outside = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) outside[i] = mask[i] ? 0 : 1
  return {
    occupant,
    mask,
    depthIn: chamfer(outside, PIXEL_WIDTH, PIXEL_HEIGHT),
    depthOut: chamfer(mask, PIXEL_WIDTH, PIXEL_HEIGHT),
    rimDepth: (Math.max(1.5, occupant.girth * 0.16) / 2) * DPR,
  }
}

function measureOne(
  subject: Subject,
  substrate: Rgba,
  passes: readonly [number, number, number, number][],
): Omit<EdgeReading, 'fixture' | 'substrate'> {
  const { mask, depthIn, depthOut, rimDepth } = subject
  const ctx = withShadowPasses(passes, () => {
    const c = makeCanvas()
    c.fillStyle = toCss(substrate)
    c.fillRect(0, 0, WIDTH, HEIGHT)
    subject.occupant.draw(c, false)
    return c
  })
  const pixels = ctx.getImageData(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT).data

  const away = (i: number): boolean => {
    const x = i % PIXEL_WIDTH
    const y = (i - x) / PIXEL_WIDTH
    const margin = 2 * DPR
    return x > margin && y > margin && x < PIXEL_WIDTH - margin && y < PIXEL_HEIGHT - margin
  }

  const rim = meanLuminance(pixels, (i) => mask[i] === 1 && depthIn[i] <= rimDepth)
  const core = meanLuminance(pixels, (i) => mask[i] === 1 && depthIn[i] > rimDepth + CORE_MARGIN * DPR)
  const surround = meanLuminance(
    pixels,
    (i) =>
      mask[i] === 0 &&
      depthOut[i] >= SURROUND_START * DPR &&
      depthOut[i] <= SURROUND_END * DPR &&
      away(i),
  )

  return {
    rim,
    core,
    surround,
    weber: Math.abs(rim - surround) / Math.max(rim, surround),
    relief: rim - core,
  }
}

/**
 * Every fixture is set up once and reused, because the silhouette and its distance fields cost far
 * more than a render and neither depends on the substrate or the shadow.
 */
const subjects = new Map<string, Subject>()
function subject(label: string): Subject {
  const cached = subjects.get(label)
  if (cached) return cached
  const made = subjectFor(fixture(label))
  subjects.set(label, made)
  return made
}

/** Measurement B across every fixture and both substrates, with the shipped shadow. */
export function measureEdgeContrast(
  passes: readonly [number, number, number, number][] = CONTACT_SHADOW_PASSES,
): EdgeReading[] {
  const readings: EdgeReading[] = []
  for (const label of FIXTURE_LABELS) {
    for (const substrate of SUBSTRATES) {
      readings.push({
        fixture: label,
        substrate: substrate.label,
        ...measureOne(subject(label), substrate.colour, passes),
      })
    }
  }
  return readings
}

// ----------------------------------------------------------------------------------------------
// Measurement D — the contact-shadow sweep
// ----------------------------------------------------------------------------------------------

export interface SweepPoint {
  readonly skirt: number
  readonly core: number
  /** The lowest edge contrast anywhere in the grid of fixtures × substrates. */
  readonly worst: number
  readonly worstCase: string
}

const SKIRT_ALPHAS = [0, 0.02, 0.03, 0.04, 0.06, 0.1, 0.14]
const CORE_ALPHAS = [0, 0.1, 0.18, 0.22, 0.26, 0.3, 0.4]

/**
 * Sweep both shadow alphas and report the worst edge contrast each pair achieves.
 *
 * The geometry of the two passes is held at the shipped values — only the alphas move, because
 * they are the pair the shipped comment claims is a maximum of the worst case.
 */
export function sweepShadow(): SweepPoint[] {
  const [skirtGeometry, coreGeometry] = CONTACT_SHADOW_PASSES
  const points: SweepPoint[] = []
  for (const skirt of SKIRT_ALPHAS) {
    for (const core of CORE_ALPHAS) {
      const passes: [number, number, number, number][] = [
        [skirtGeometry[0], skirtGeometry[1], skirtGeometry[2], skirt],
        [coreGeometry[0], coreGeometry[1], coreGeometry[2], core],
      ]
      let worst = Infinity
      let worstCase = ''
      for (const reading of measureEdgeContrast(passes)) {
        if (reading.weber < worst) {
          worst = reading.weber
          worstCase = `${reading.fixture} / ${reading.substrate}`
        }
      }
      points.push({ skirt, core, worst, worstCase })
    }
  }
  return points
}

// ----------------------------------------------------------------------------------------------
// R — the rim-shade sweep
// ----------------------------------------------------------------------------------------------

export interface RimPoint {
  /** How far toward white the rim stroke sits, for a base colour on the dark side of the flip. */
  readonly amount: number
  readonly alpha: number
  readonly worst: number
  readonly worstCase: string
  /** `rim − core` on the fixture the whole exercise is about. Wants to be positive. */
  readonly starlightRelief: number
  readonly garterRelief: number
}

const RIM_AMOUNTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
const RIM_ALPHAS = [0.22, 0.26, 0.3, 0.34, 0.4]

/** What the rim used to be: one absolute darkening, whatever the animal was. */
const ABSOLUTE_RIM = { toward: rgba(20, 14, 24, 1), amount: 0.4, alpha: 0.22 }
/** What the contact shadow used to be, when it was the only thing holding the silhouette up. */
const COMPENSATING_SHADOW: [number, number, number, number][] = [
  [0.34, 0.22, 0.1, 0.06],
  [0.22, 0.15, 0, 0.3],
]

/**
 * The whole change, measured four ways: each rim against each contact shadow.
 *
 * The corner that matters is that the two are not independent — the old shadow was picked to
 * compensate for the old rim, so "new rim, old shadow" is over-darkened rather than better.
 */
export function compareRimAndShadow(): { label: string; readings: EdgeReading[]; worst: number }[] {
  const shipped = { ...RIM_SHADE.lighten }
  const rows: { label: string; readings: EdgeReading[]; worst: number }[] = []
  try {
    for (const rim of [
      { label: 'absolute rim', lighten: ABSOLUTE_RIM },
      { label: 'relative rim', lighten: shipped },
    ]) {
      for (const shadow of [
        { label: 'shadow 0.06/0.30', passes: COMPENSATING_SHADOW },
        { label: 'shadow 0.03/0.22', passes: CONTACT_SHADOW_PASSES },
      ]) {
        RIM_SHADE.lighten = rim.lighten
        const readings = measureEdgeContrast(shadow.passes)
        rows.push({
          label: `${rim.label} · ${shadow.label}`,
          readings,
          worst: readings.reduce((a, r) => Math.min(a, r.weber), Infinity),
        })
      }
    }
  } finally {
    RIM_SHADE.lighten = shipped
  }
  return rows
}

/**
 * Sweep the *lighten* side of {@link RIM_SHADE} only.
 *
 * The darken side is deliberately held at the values that shipped before the rim became relative:
 * a pale animal was never the broken case, and changing it would be a change nobody asked for.
 */
export function sweepRim(): RimPoint[] {
  const shipped = { ...RIM_SHADE.lighten }
  const points: RimPoint[] = []
  try {
    for (const amount of RIM_AMOUNTS) {
      for (const alpha of RIM_ALPHAS) {
        RIM_SHADE.lighten = { ...shipped, amount, alpha }
        const readings = measureEdgeContrast()
        const worst = readings.reduce((a, b) => (b.weber < a.weber ? b : a))
        const relief = (fixtureLabel: string): number =>
          readings.filter((r) => r.fixture === fixtureLabel).reduce((a, r) => a + r.relief, 0) / SUBSTRATES.length
        points.push({
          amount,
          alpha,
          worst: worst.weber,
          worstCase: `${worst.fixture} / ${worst.substrate}`,
          starlightRelief: relief('Starlight (invented)'),
          garterRelief: relief('Garter — striped'),
        })
      }
    }
  } finally {
    RIM_SHADE.lighten = shipped
  }
  return points
}

// ----------------------------------------------------------------------------------------------
// The page
// ----------------------------------------------------------------------------------------------

declare global {
  interface Window {
    edgeContrastProbe: {
      measureEdgeContrast: typeof measureEdgeContrast
      sweepShadow: typeof sweepShadow
      sweepRim: typeof sweepRim
      compareRimAndShadow: typeof compareRimAndShadow
    }
  }
}

/**
 * The same animals, drawn large enough to judge by eye.
 *
 * A number can tell you the silhouette reads; it cannot tell you the rim light has turned a
 * garter snake into a chrome toy. Every candidate the sweep suggests gets looked at here before
 * it is written into {@link RIM_SHADE}.
 */
interface Candidate {
  readonly label: string
  readonly lighten?: typeof RIM_SHADE.lighten
  readonly shadow?: readonly [number, number, number, number][]
}

function gallery(labels: readonly string[], candidates: readonly Candidate[]): HTMLElement {
  const strip = document.createElement('div')
  strip.className = 'gallery'
  const shipped = { ...RIM_SHADE.lighten }
  try {
    for (const candidate of candidates) {
      for (const label of labels) {
        for (const substrate of SUBSTRATES) {
          RIM_SHADE.lighten = candidate.lighten ?? shipped
          const ctx = withShadowPasses(candidate.shadow ?? CONTACT_SHADOW_PASSES, () => {
            const c = makeCanvas()
            c.fillStyle = toCss(substrate.colour)
            c.fillRect(0, 0, WIDTH, HEIGHT)
            subject(label).occupant.draw(c, false)
            return c
          })
          const cell = document.createElement('figure')
          // Shown at one device pixel per CSS pixel — twice the drawn size, because the rim is two
          // logical pixels thick and at 1× you are judging something you cannot see.
          ctx.canvas.style.width = `${PIXEL_WIDTH}px`
          const caption = document.createElement('figcaption')
          caption.textContent = `${candidate.label} · ${substrate.label}`
          cell.append(ctx.canvas, caption)
          strip.append(cell)
        }
      }
    }
  } finally {
    RIM_SHADE.lighten = shipped
  }
  return strip
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  const el = document.createElement('table')
  el.innerHTML =
    `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`
  return el
}

function heading(text: string): HTMLElement {
  const el = document.createElement('h2')
  el.textContent = text
  return el
}

function paint(root: HTMLElement): void {
  root.append(heading('The two fixtures on the lighten side of the flip, old rim and candidates'))
  root.append(
    gallery(['Starlight (invented)', 'Garter — striped'], [
      { label: 'was: absolute darken', lighten: ABSOLUTE_RIM },
      { label: 'toward 0.6 α 0.30', lighten: { ...RIM_SHADE.lighten, amount: 0.6, alpha: 0.3 } },
      { label: 'toward 0.8 α 0.30', lighten: { ...RIM_SHADE.lighten, amount: 0.8, alpha: 0.3 } },
      { label: 'toward 0.9 α 0.40', lighten: { ...RIM_SHADE.lighten, amount: 0.9, alpha: 0.4 } },
    ]),
  )

  root.append(heading('The mid-tone fixtures nearest the flip, on the lighten side of it'))
  root.append(
    gallery(['Aurora (invented)', 'Combo — albino + piebald'], [
      { label: 'was: absolute darken', lighten: ABSOLUTE_RIM },
      { label: 'shipped' },
    ]),
  )

  root.append(heading('Contact shadow, at the compensating alphas and lighter ones'))
  root.append(
    gallery(['Ball python — wild type', 'Hognose — superarctic'], [
      { label: 'was 0.06/0.30', shadow: [[0.34, 0.22, 0.1, 0.06], [0.22, 0.15, 0, 0.3]] },
      { label: 'shipped', shadow: CONTACT_SHADOW_PASSES },
      { label: 'shadow 0.02/0.18', shadow: [[0.34, 0.22, 0.1, 0.02], [0.22, 0.15, 0, 0.18]] },
      { label: 'none', shadow: [] },
    ]),
  )

  root.append(heading('B — edge contrast, shipped rim and contact shadow'))
  root.append(
    table(
      ['fixture', 'substrate', 'rim', 'core', 'surround', 'relief', 'Weber'],
      measureEdgeContrast().map((r) => [
        r.fixture,
        r.substrate,
        r.rim.toFixed(1),
        r.core.toFixed(1),
        r.surround.toFixed(1),
        r.relief.toFixed(1),
        r.weber.toFixed(3),
      ]),
    ),
  )

  root.append(heading('B — every case, each rim against each contact shadow'))
  const compared = compareRimAndShadow()
  root.append(
    table(
      ['configuration', ...compared[0].readings.map((r) => `${r.fixture.split(' ')[0]} / ${r.substrate}`), 'worst'],
      compared.map((row) => [
        row.label,
        ...row.readings.map((r) => r.weber.toFixed(3)),
        row.worst.toFixed(3),
      ]),
    ),
  )

  root.append(heading('R — rim shade sweep, lighten side (worst case over B)'))
  const rim = sweepRim()
  const bestRim = rim.reduce((a, b) => (b.worst > a.worst ? b : a))
  root.append(
    table(
      ['toward white', 'α', 'worst Weber', 'worst case', 'Starlight relief', 'Garter relief'],
      rim.map((p) => [
        p.amount.toFixed(2) + (p === bestRim ? ' ★' : ''),
        p.alpha.toFixed(2),
        p.worst.toFixed(3),
        p.worstCase,
        p.starlightRelief.toFixed(1),
        p.garterRelief.toFixed(1),
      ]),
    ),
  )

  root.append(heading('D — contact-shadow alpha sweep (worst case over B)'))
  const sweep = sweepShadow()
  const best = sweep.reduce((a, b) => (b.worst > a.worst ? b : a))
  root.append(
    table(
      ['skirt α', 'core α', 'worst Weber', 'worst case'],
      sweep.map((p) => [
        p.skirt.toFixed(2) + (p === best ? ' ★' : ''),
        p.core.toFixed(2),
        p.worst.toFixed(3),
        p.worstCase,
      ]),
    ),
  )
}

const root = document.getElementById('probe')
if (root) {
  window.edgeContrastProbe = { measureEdgeContrast, sweepShadow, sweepRim, compareRimAndShadow }
  paint(root)
}
