/**
 * The render lab — a page that exists only so you can look at the snakes.
 *
 * Open `/render-lab.html` while the dev server is running. It is deliberately separate from the
 * game: no React, no game state, no genetics. Just fixtures and the renderer, so that when
 * something looks wrong there is only one place it can be wrong in.
 *
 * If you are changing a pattern, keep this page open on a second monitor. Vite reloads it the
 * moment you save, and there is a Rebake button for when you have edited a stage and want the
 * cached textures thrown away.
 */

import {
  SnakeView,
  clearPortraitCache,
  clearTextureCache,
  describeEffects,
  fitCanvasToDisplay,
  renderPortrait,
  startRenderLoop,
  type SnakeMode,
} from '../index'
import { FIXTURES } from './fixtures'

const CELL_LABEL_HEIGHT = 26

/**
 * `?only=ball` shows just the fixtures whose label contains "ball", filling the window with
 * one or two big snakes. Indispensable when you are looking at a pattern closely — everything
 * on this page is too small to judge at twelve-up.
 */
const filter = new URLSearchParams(window.location.search).get('only')
const SHOWN = filter
  ? FIXTURES.filter((p) => p.label.toLowerCase().includes(filter.toLowerCase()))
  : FIXTURES

const root = document.getElementById('lab')
if (!root) throw new Error('render-lab.html is missing its #lab element')

// --- toolbar -------------------------------------------------------------------------------

const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
root.appendChild(toolbar)

const status = document.createElement('span')
status.className = 'status'

let mode: SnakeMode = 'wander'
let showPortraits = false

toolbar.append(
  button('Wander / Rest', () => {
    mode = mode === 'wander' ? 'rest' : 'wander'
    for (const view of views) view.mode = mode
    status.textContent = `mode: ${mode}`
  }),
  button('Live / Portraits', () => {
    showPortraits = !showPortraits
    canvas.style.display = showPortraits ? 'none' : 'block'
    portraits.style.display = showPortraits ? 'grid' : 'none'
    if (showPortraits) fillPortraits()
  }),
  button('Rebake textures', () => {
    clearTextureCache()
    clearPortraitCache()
    rebuild()
    if (showPortraits) fillPortraits()
  }),
  status,
)

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

// --- surfaces ------------------------------------------------------------------------------

const canvas = document.createElement('canvas')
canvas.className = 'stage'
root.appendChild(canvas)

const portraits = document.createElement('div')
portraits.className = 'portraits'
portraits.style.display = 'none'
root.appendChild(portraits)

const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('This browser did not give us a 2D canvas context')

// --- grid ----------------------------------------------------------------------------------

interface Cell {
  x: number
  y: number
  width: number
  height: number
}

let views: SnakeView[] = []
let cells: Cell[] = []

function layout(width: number, height: number): Cell[] {
  const n = SHOWN.length
  const cols = Math.max(1, Math.round(Math.sqrt((n * width) / Math.max(1, height))))
  const rows = Math.ceil(n / cols)
  const cellW = width / cols
  const cellH = height / rows
  const out: Cell[] = []
  for (let i = 0; i < n; i++) {
    out.push({ x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH, width: cellW, height: cellH })
  }
  return out
}

/** Rebuild every view. Called on load and whenever the window changes size. */
function rebuild(): void {
  const rect = canvas.getBoundingClientRect()
  cells = layout(rect.width, rect.height)
  views = SHOWN.map((phenotype, i) => {
    const cell = cells[i]
    return new SnakeView(phenotype, {
      bounds: {
        x: cell.x + 8,
        y: cell.y + CELL_LABEL_HEIGHT,
        width: cell.width - 16,
        height: cell.height - CELL_LABEL_HEIGHT - 8,
      },
      mode,
    })
  })
}

function fillPortraits(): void {
  portraits.replaceChildren()
  for (const phenotype of SHOWN) {
    const wrapper = document.createElement('figure')
    wrapper.appendChild(renderPortrait(phenotype, { width: 240, height: 150 }))
    const caption = document.createElement('figcaption')
    caption.textContent = phenotype.label
    wrapper.appendChild(caption)
    portraits.appendChild(wrapper)
  }
}

// --- the loop ------------------------------------------------------------------------------

let frames = 0
let sinceStatus = 0

rebuild()
window.addEventListener('resize', () => {
  fitCanvasToDisplay(canvas, ctx)
  rebuild()
})

startRenderLoop((dt) => {
  if (showPortraits) return
  if (fitCanvasToDisplay(canvas, ctx)) rebuild()

  const rect = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)

  for (let i = 0; i < views.length; i++) {
    const cell = cells[i]
    const view = views[i]

    ctx.save()
    ctx.beginPath()
    ctx.rect(cell.x + 4, cell.y + 4, cell.width - 8, cell.height - 8)
    ctx.clip()
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'
    ctx.fillRect(cell.x + 4, cell.y + 4, cell.width - 8, cell.height - 8)

    view.update(dt)
    view.draw(ctx)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = 'rgba(236, 240, 248, 0.85)'
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(view.phenotype.label, cell.x + 12, cell.y + 20)
    const extras = describeEffects(view.phenotype)
    if (extras) {
      ctx.fillStyle = 'rgba(160, 200, 240, 0.7)'
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(extras, cell.x + 12, cell.y + 34)
    }
    ctx.restore()
  }

  frames++
  sinceStatus += dt
  if (sinceStatus > 0.5) {
    status.textContent = `mode: ${mode}   ·   ${Math.round(frames / sinceStatus)} fps   ·   ${views.length} snakes`
    frames = 0
    sinceStatus = 0
  }
})
