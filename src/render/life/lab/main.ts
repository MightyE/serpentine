/**
 * The life-stages lab — open `/life-lab.html` with the dev server running.
 *
 * Three panels, each answering one question you cannot answer by reading code:
 *
 * 1. **Four ages, one animal, one scale.** Is that a baby, or is it a small adult? Everything is
 *    drawn in real pixels with no per-cell fitting, so the sizes and the proportions are both
 *    honest and directly comparable.
 * 2. **The growth slider.** Does it grow, or does it pop between forms? Drag it slowly.
 * 3. **The hatch.** Replayable, because that is how it will actually be watched.
 *
 * The numbers under the slider are there because "it looks bigger-headed" is not a thing you can
 * check. `head ÷ length` is: if it does not move as you drag, something has regressed to scaling.
 */

import { bodyLength, widthProfile } from '../../bodyShape'
import { fitCanvasToDisplay, startRenderLoop } from '../../loop'
import { clearTextureCache, patternTextureFor } from '../../texture'
import { clearPortraitCache } from '../../portrait'
import type { Phenotype } from '../../contract'
import '../../index' // registers the built-in stages, without which no phenotype compiles
import { FIXTURES } from '../../lab/fixtures'
import { drawEgg, drawNest } from '../egg'
import { HatchAnimation, HATCH_DURATION } from '../hatch'
import { LifeSnakeView, type LifePose } from '../view'
import { ageOfStage, eyeScaleAtAge, lifeShapeAtAge, stageAtAge } from '../stage'

const root = document.getElementById('lab')
if (!root) throw new Error('life-lab.html is missing its #lab element')

// --- state ---------------------------------------------------------------------------------

const initial = new URLSearchParams(window.location.search).get('fixture')
let subject: Phenotype =
  FIXTURES.find((p) => p.label.toLowerCase().includes((initial ?? '').toLowerCase())) ?? FIXTURES[0]
let pose: LifePose = 'showcase'
let growing = false
/**
 * Magnification for the two body panels.
 *
 * Not a fitting factor — every cell gets the *same* zoom, so the comparison between ages stays
 * honest at any setting. It exists because at ×1 a hatchling is 108 logical pixels long and you
 * cannot see its face, which is where half the age read lives.
 */
let zoom = Number(new URLSearchParams(window.location.search).get('zoom') ?? 1) || 1

// --- toolbar -------------------------------------------------------------------------------

const toolbar = el('div', 'toolbar')
root.appendChild(toolbar)

const picker = document.createElement('select')
for (const fixture of FIXTURES) {
  const option = document.createElement('option')
  option.value = fixture.label
  option.textContent = fixture.label
  picker.appendChild(option)
}
picker.value = subject.label
picker.addEventListener('change', () => {
  subject = FIXTURES.find((p) => p.label === picker.value) ?? FIXTURES[0]
  rebuildAll()
})

const status = el('span', 'status')

toolbar.append(
  picker,
  button('Pose: showcase', (btn) => {
    pose = pose === 'showcase' ? 'wander' : pose === 'wander' ? 'rest' : 'showcase'
    btn.textContent = `Pose: ${pose}`
    for (const view of stageViews) view.pose = pose
    growthView.pose = pose
  }),
  button(`Zoom ×${zoom}`, (btn) => {
    zoom = zoom >= 3 ? 1 : zoom + 1
    btn.textContent = `Zoom ×${zoom}`
  }),
  button('Replay hatch', () => hatch.replay()),
  button('Rebake textures', () => {
    clearTextureCache()
    clearPortraitCache()
    rebuildAll()
  }),
  status,
)

// --- panel 1: four ages, one scale -----------------------------------------------------------

const stagePanel = panel(
  'The same animal at four ages, drawn at one scale',
  'Nothing here is fitted to its cell — an adult really is that much longer than its own ' +
    'hatchling, and the egg really is that small. Look at the head: on the hatchling it is a ' +
    'fifth of the whole animal and wider than its belly; on the adult it is an eighth and ' +
    'narrower. That is the difference a scale factor cannot make.',
)
const stageCanvas = document.createElement('canvas')
stageCanvas.style.height = '260px'
stagePanel.appendChild(stageCanvas)
const stageCtx = context(stageCanvas)

const STAGE_CELLS = ['egg', 'hatchling', 'juvenile', 'adult'] as const
let stageViews: LifeSnakeView[] = []

// --- panel 2: growth -------------------------------------------------------------------------

const growthPanel = panel(
  'Growth is one continuous number',
  'Drag slowly. Age is a single 0–1 parameter and every proportion is a smooth function of ' +
    'it, so there is no frame where the animal is between two forms rather than at an age. ' +
    'The markings are the same baked texture at every position on the slider — same seed, ' +
    'same animal, differently-proportioned body.',
)
const growthCanvas = document.createElement('canvas')
growthCanvas.style.height = '190px'
growthPanel.appendChild(growthCanvas)
const growthCtx = context(growthCanvas)

const controls = el('div', 'controls')
const slider = document.createElement('input')
slider.type = 'range'
slider.min = '0'
slider.max = '1'
slider.step = '0.001'
slider.value = '0'
slider.addEventListener('input', () => {
  growing = false
  growthView.setAge(Number(slider.value))
})
controls.append(
  button('Grow ▶', () => {
    growing = !growing
    if (growing && Number(slider.value) >= 0.999) slider.value = '0'
  }),
  slider,
)
growthPanel.appendChild(controls)

const readout = el('div', 'readout')
growthPanel.appendChild(readout)

// --- panel 3: the hatch ----------------------------------------------------------------------

const hatchPanel = panel(
  'Hatching',
  'Under seven seconds, and replayable — it will be watched more than once. Wait through the ' +
    'stillness; the pip is deliberately small. The body comes out in three surges rather than ' +
    'smoothly, because that is what a hatchling actually does.',
)
const hatchCanvas = document.createElement('canvas')
hatchCanvas.style.height = '300px'
hatchPanel.appendChild(hatchCanvas)
const hatchCtx = context(hatchCanvas)

const hatchControls = el('div', 'controls')
hatchControls.append(
  button('Replay', () => {
    hatchPaused = false
    hatch.replay()
  }),
  button('Loop: off', (btn) => {
    loopHatch = !loopHatch
    btn.textContent = `Loop: ${loopHatch ? 'on' : 'off'}`
  }),
)
hatchPanel.appendChild(hatchControls)
const hatchReadout = el('div', 'readout')
hatchPanel.appendChild(hatchReadout)

let loopHatch = false
let hatchPaused = false
let hatch = new HatchAnimation(subject)

/**
 * A console handle on the running lab, so a specific moment of the hatch can be held still and
 * looked at: `lab.scrub(3.4)`. Six seconds of animation is otherwise very hard to inspect one
 * frame at a time, and "it looked fine while it went past" is not verification.
 */
Object.defineProperty(window, 'lab', {
  value: {
    get hatch() {
      return hatch
    },
    scrub(seconds: number) {
      hatch.replay()
      hatch.update(seconds)
      loopHatch = false
      hatchPaused = true
    },
    play() {
      hatchPaused = false
    },
  },
  configurable: true,
})

// --- build ----------------------------------------------------------------------------------

let growthView = makeGrowthView()

function cellRect(index: number, count: number, width: number, height: number) {
  const cellWidth = width / count
  return { x: index * cellWidth + 10, y: 34, width: cellWidth - 20, height: height - 48 }
}

function rebuildStageViews(): void {
  const rect = stageCanvas.getBoundingClientRect()
  stageViews = STAGE_CELLS.map((stage, i) => {
    const bounds = cellRect(i, STAGE_CELLS.length, rect.width, rect.height)
    // The egg cell holds a hatchling too — it is what is inside — but it is never drawn.
    return new LifeSnakeView(subject, { bounds, age: ageOfStage(stage), pose })
  })
}

function makeGrowthView(): LifeSnakeView {
  const rect = growthCanvas.getBoundingClientRect()
  return new LifeSnakeView(subject, {
    bounds: { x: 12, y: 12, width: Math.max(80, rect.width - 24), height: Math.max(60, rect.height - 24) },
    age: Number(slider.value),
    pose,
  })
}

function rebuildAll(): void {
  rebuildStageViews()
  growthView = makeGrowthView()
  hatch = new HatchAnimation(subject)
}

rebuildAll()
window.addEventListener('resize', () => {
  fitCanvasToDisplay(stageCanvas, stageCtx)
  fitCanvasToDisplay(growthCanvas, growthCtx)
  fitCanvasToDisplay(hatchCanvas, hatchCtx)
  rebuildAll()
})

// --- the loop ---------------------------------------------------------------------------------

let frames = 0
let sinceStatus = 0

startRenderLoop((dt) => {
  if (
    fitCanvasToDisplay(stageCanvas, stageCtx) ||
    fitCanvasToDisplay(growthCanvas, growthCtx) ||
    fitCanvasToDisplay(hatchCanvas, hatchCtx)
  ) {
    rebuildAll()
  }

  drawStagePanel(dt)
  drawGrowthPanel(dt)
  drawHatchPanel(dt)

  frames++
  sinceStatus += dt
  if (sinceStatus > 0.5) {
    // Object identity, not equality: every age of this animal is painted with the *same* baked
    // texture object. If this ever says "rebaked", growth has started regenerating markings.
    const shared = patternTextureFor(subject) === patternTextureFor(subject)
    status.textContent = `${Math.round(frames / sinceStatus)} fps · markings: ${
      shared ? 'one shared texture' : 'REBAKED — bug'
    }`
    frames = 0
    sinceStatus = 0
  }
})

function drawStagePanel(dt: number): void {
  const rect = stageCanvas.getBoundingClientRect()
  stageCtx.clearRect(0, 0, rect.width, rect.height)

  for (let i = 0; i < STAGE_CELLS.length; i++) {
    const stage = STAGE_CELLS[i]
    const bounds = cellRect(i, STAGE_CELLS.length, rect.width, rect.height)

    stageCtx.save()
    stageCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)'
    stageCtx.fillRect(bounds.x - 6, 8, bounds.width + 12, rect.height - 16)
    stageCtx.restore()

    // One clip and one magnification per cell, both identical across cells — so zooming in
    // never turns the comparison into "each age fitted to its own box", which would hide the
    // very thing the panel exists to show.
    stageCtx.save()
    stageCtx.beginPath()
    stageCtx.rect(bounds.x - 6, 8, bounds.width + 12, rect.height - 16)
    stageCtx.clip()
    magnify(stageCtx, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)

    if (stage === 'egg') {
      // Drawn at the size it actually is relative to the animal inside it: a snake egg is a
      // little over a third the length of the hatchling that comes out of it.
      const length = bodyLength(subject.body, lifeShapeAtAge(0)) * 0.38
      const geom = {
        centre: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        length,
        tilt: -0.12,
      }
      drawNest(stageCtx, geom)
      drawEgg(stageCtx, hatch.shell, geom)
    } else {
      const view = stageViews[i]
      view.update(dt)
      view.draw(stageCtx)
    }
    stageCtx.restore()

    stageCtx.save()
    stageCtx.fillStyle = 'rgba(236, 240, 248, 0.85)'
    stageCtx.font = '13px ui-sans-serif, system-ui, sans-serif'
    stageCtx.fillText(stage, bounds.x, 18)
    stageCtx.fillStyle = 'rgba(160, 200, 240, 0.62)'
    stageCtx.font = '11px ui-sans-serif, system-ui, sans-serif'
    stageCtx.fillText(describeAge(ageOfStage(stage)), bounds.x, 31)
    stageCtx.restore()
  }
}

function drawGrowthPanel(dt: number): void {
  if (growing) {
    const next = Math.min(1, growthView.currentAge + dt / 7)
    slider.value = String(next)
    growthView.setAge(next)
    if (next >= 1) growing = false
  }

  const rect = growthCanvas.getBoundingClientRect()
  growthCtx.clearRect(0, 0, rect.width, rect.height)
  growthCtx.save()
  magnify(growthCtx, rect.width / 2, rect.height / 2)
  growthView.update(dt)
  growthView.draw(growthCtx)
  growthCtx.restore()
  updateReadout(growthView.currentAge)
}

function drawHatchPanel(dt: number): void {
  if (!hatchPaused) hatch.update(dt)
  if (loopHatch && hatch.finished) hatch.replay()

  const rect = hatchCanvas.getBoundingClientRect()
  hatchCtx.clearRect(0, 0, rect.width, rect.height)

  // Zoomed, unlike panel 1 — a real egg is small and this is the one moment worth a close look.
  const length = Math.min(rect.width * 0.16, rect.height * 0.3)
  const scale = length / (bodyLength(subject.body, lifeShapeAtAge(0)) * 0.38)
  hatchCtx.save()
  hatchCtx.translate(rect.width * 0.34, rect.height * 0.46)
  hatchCtx.scale(scale, scale)
  hatch.draw(hatchCtx, { centre: { x: 0, y: 0 }, length: length / scale, tilt: -0.1 })
  hatchCtx.restore()

  hatchReadout.innerHTML =
    `<span><b>phase</b> ${hatch.phase}</span>` +
    `<span><b>t</b> ${hatch.elapsed.toFixed(2)} / ${HATCH_DURATION.toFixed(1)}s</span>` +
    `<span><b>emerged</b> ${(hatch.emerged * 100).toFixed(0)}%</span>`
}

// --- readout -----------------------------------------------------------------------------------

function updateReadout(age: number): void {
  const shape = lifeShapeAtAge(age)
  const profile = widthProfile(subject.body, shape)
  const length = bodyLength(subject.body, shape)
  const head = profile[2].value
  const peak = profile[4].value

  readout.innerHTML =
    `<span><b>age</b> ${age.toFixed(2)} (${stageAtAge(age)})</span>` +
    `<span><b>length</b> ${length.toFixed(0)}px</span>` +
    `<span><b>head ÷ length</b> ${((head / length) * 100).toFixed(1)}%</span>` +
    `<span><b>head ÷ belly</b> ${(head / peak).toFixed(2)}</span>` +
    `<span><b>girth ÷ length</b> ${((peak / length) * 100).toFixed(1)}%</span>` +
    `<span><b>head is</b> ${(shape.headSpan * 100).toFixed(0)}% of the body</span>` +
    `<span><b>eye</b> ×${eyeScaleAtAge(age).toFixed(2)}</span>`
}

function describeAge(age: number): string {
  const shape = lifeShapeAtAge(age)
  const profile = widthProfile(subject.body, shape)
  const length = bodyLength(subject.body, shape)
  return `${length.toFixed(0)}px · head ${((profile[2].value / length) * 100).toFixed(1)}% of length`
}

// --- tiny DOM helpers ---------------------------------------------------------------------------

/** Scale the context about a point, so magnifying does not also move things around. */
function magnify(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.translate(cx, cy)
  ctx.scale(zoom, zoom)
  ctx.translate(-cx, -cy)
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function button(label: string, onClick: (self: HTMLButtonElement) => void): HTMLButtonElement {
  const node = document.createElement('button')
  node.textContent = label
  node.addEventListener('click', () => onClick(node))
  return node
}

function panel(title: string, note: string): HTMLElement {
  const section = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = title
  const paragraph = el('p', 'note')
  paragraph.textContent = note
  section.append(heading, paragraph)
  root!.appendChild(section)
  return section
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser did not give us a 2D canvas context')
  return ctx
}
