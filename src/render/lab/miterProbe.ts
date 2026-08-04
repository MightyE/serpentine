/**
 * The joint probe — a still, deterministic look at what happens where the body turns hardest.
 *
 * Open `/miter-probe.html`. Unlike the render lab this page does not animate and does not use
 * `SnakeView` at all: it lays the spine out directly from {@link coilPose}, builds one ribbon,
 * and paints it once. Same input, same pixels, every reload — which is the only way to compare
 * a screenshot taken before a geometry change against one taken after.
 *
 * A resting coil is the sharpest turn this renderer ever produces (the innermost joints turn
 * over 50° in a single 6.7px segment against an 18px-wide body), so it is the case where any
 * per-segment approximation shows up first.
 *
 * The bottom row is the diagnostic one. The real draw path lays an opaque undercoat of base
 * colour down first (see `snake.ts`), which turns a missing wedge of pattern into a wedge of
 * plain body colour rather than a hole — visible, but easy to mistake for the pattern. Row two
 * paints the texture strips onto a loud background with no undercoat, so anything the strips
 * fail to cover is unmistakable.
 *
 * Reading the bare rows: bright background *between* the loops of the spiral is correct — that is
 * the gap between separate coils of the animal. What matters is background *inside* one loop,
 * especially a thin wedge biting into the outer edge of a bend.
 */

import { buildRibbon, paintRibbon, traceRibbon, patternTextureFor, toCss, coilPose } from '../index'
import { widthProfile, bodyLength } from '../bodyShape'
import { FIXTURES } from './fixtures'
import type { Phenotype } from '../contract'
import type { Vec2 } from '../geometry'

/**
 * Two subjects, because the two pattern axes fail differently.
 *
 * A missing wedge is a slice *across* the body. On the blotched corn it nibbles the edge of a
 * crosswise blotch and is easy to miss. On the striped garter it cuts each lengthwise stripe into
 * dashes, and a dashed stripe over a dark substrate is what gets reported as "the snake is
 * see-through". The striped cell is the one to read for that.
 */
const SUBJECT_LABELS = ['Corn — wild type', 'Garter — striped'] as const
const SUBJECTS = SUBJECT_LABELS.map((label) => {
  const found = FIXTURES.find((f) => f.label === label)
  if (!found) throw new Error(`miter probe expects the ${JSON.stringify(label)} fixture`)
  return found
})

/** How hard the coil is wound. 1 is what a resting snake in the game actually does. */
const TIGHTNESS = [1, 1.5, 2] as const
const POINT_COUNT = 46
const CELL = 340

interface View {
  readonly heading: string
  readonly zoom: number
  /** True for the real draw path: opaque base colour first, then the strips over it. */
  readonly undercoat: boolean
  /**
   * Which spine point to centre on. The head sits at the middle of the coil and is a wide, bland
   * blob, so a magnified view parked on the origin shows the least interesting joints on the
   * animal. Point 14 is a third of the way down the body: full mid-body girth, still turning ~15°
   * per segment.
   */
  readonly focus?: number
}

/**
 * Three passes over the same geometry. The magnified pass is the one to read: at 2.4x a 2px
 * wedge is two pixels, and at 9x it is eighteen.
 */
const VIEWS: readonly View[] = [
  { heading: 'As the game draws it — undercoat of base colour, then texture strips', zoom: 2.4, undercoat: true },
  { heading: 'Texture strips alone — anything the strips miss shows as background', zoom: 2.4, undercoat: false },
  { heading: 'Mid-body joints at 9x, strips only — full girth, and still turning hard', zoom: 9, undercoat: false, focus: 14 },
]

const root = document.getElementById('probe')
if (!root) throw new Error('miter-probe.html is missing its #probe element')

/**
 * The exact spine a resting snake settles onto, without the wave or the head sway — those move
 * every frame and would make two screenshots incomparable.
 */
function coilSpine(phenotype: Phenotype, tightness: number): Vec2[] {
  const length = bodyLength(phenotype.body)
  return coilPose({ x: 0, y: 0 }, POINT_COUNT, length / (POINT_COUNT - 1), tightness)
}

function drawCell(ctx: CanvasRenderingContext2D, phenotype: Phenotype, tightness: number, view: View): void {
  const spine = coilSpine(phenotype, tightness)
  const ribbon = buildRibbon(spine, widthProfile(phenotype.body))
  const texture = patternTextureFor(phenotype)

  ctx.save()
  ctx.translate(CELL / 2, CELL / 2)
  ctx.scale(view.zoom, view.zoom)
  if (view.focus !== undefined) {
    const at = spine[view.focus]
    ctx.translate(-at.x, -at.y)
  }

  if (view.undercoat) {
    ctx.save()
    traceRibbon(ctx, ribbon)
    ctx.fillStyle = toCss(phenotype.baseColour)
    ctx.fill()
    ctx.restore()
  }

  paintRibbon(ctx, ribbon, texture.canvas, texture.width, texture.height, 0)
  ctx.restore()
}

function cell(phenotype: Phenotype, tightness: number, view: View): HTMLElement {
  const figure = document.createElement('figure')
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = CELL * dpr
  canvas.height = CELL * dpr
  canvas.style.width = `${CELL}px`
  canvas.style.height = `${CELL}px`
  canvas.className = view.undercoat ? 'shot' : 'shot bare'

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser did not give us a 2D canvas context')
  ctx.scale(dpr, dpr)
  drawCell(ctx, phenotype, tightness, view)

  const caption = document.createElement('figcaption')
  caption.textContent = `tightness ${tightness} · ${view.zoom}x`
  figure.append(canvas, caption)
  return figure
}

for (const view of VIEWS) {
  for (const subject of SUBJECTS) {
    const row = document.createElement('section')
    row.className = 'row'
    const heading = document.createElement('h2')
    heading.textContent = `${subject.label} — ${view.heading}`
    row.appendChild(heading)
    const strip = document.createElement('div')
    strip.className = 'cells'
    for (const tightness of TIGHTNESS) strip.appendChild(cell(subject, tightness, view))
    row.appendChild(strip)
    root.appendChild(row)
  }
}
