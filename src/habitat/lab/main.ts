/**
 * The habitat lab: every biome, at a size you can actually see, with the feature set switchable.
 *
 * Dev-only, and deliberately not React — the point of a lab is that it boots in one file with no
 * app state behind it, so a broken biome can be looked at without a running game. Same shape as
 * `src/render/lab/main.ts`.
 *
 * Open `habitat-lab.html`.
 */

import '../index'
import { biomeRegistry, featureRegistry } from '../registry'
import { drawEnclosure } from '../compose'
import type { FeatureProvision } from '../contract'

type Furnishing = 'bare' | 'basic' | 'full'

const FURNISHINGS: Readonly<Record<Furnishing, readonly string[]>> = {
  bare: [],
  basic: ['cork-hide', 'water-bowl'],
  full: ['cork-hide', 'humid-hide', 'water-bowl', 'climbing-branch', 'basking-stone', 'leaf-bedding'],
}

const root = document.getElementById('lab')
if (!root) throw new Error('habitat lab: no #lab element')

let furnishing: Furnishing = 'basic'
let generation = 0
let scale = 1

function featuresFor(furnish: Furnishing): FeatureProvision[] {
  return FURNISHINGS[furnish]
    .map((id) => featureRegistry.get(id))
    .filter((f): f is FeatureProvision => f !== undefined)
}

function render(): void {
  if (!root) return
  root.innerHTML = ''

  const bar = document.createElement('div')
  bar.className = 'toolbar'
  for (const option of Object.keys(FURNISHINGS) as Furnishing[]) {
    const button = document.createElement('button')
    button.textContent = option
    button.className = option === furnishing ? 'on' : ''
    button.onclick = () => {
      furnishing = option
      render()
    }
    bar.append(button)
  }
  const reseed = document.createElement('button')
  reseed.textContent = 'reseed'
  reseed.onclick = () => {
    generation++
    render()
  }
  bar.append(reseed)

  const zoom = document.createElement('button')
  zoom.textContent = scale === 1 ? 'thumbnail size' : 'full size'
  zoom.onclick = () => {
    scale = scale === 1 ? 0.28 : 1
    render()
  }
  bar.append(zoom)

  const status = document.createElement('span')
  status.className = 'status'
  status.textContent = `${biomeRegistry.list().length} biomes · ${featureRegistry.list().length} features`
  bar.append(status)
  root.append(bar)

  const grid = document.createElement('div')
  grid.className = 'grid'
  root.append(grid)

  const features = featuresFor(furnishing)

  for (const biome of biomeRegistry.list()) {
    const figure = document.createElement('figure')
    const canvas = document.createElement('canvas')
    const width = Math.round(520 * scale)
    const height = Math.round(340 * scale)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawEnclosure(ctx, {
        id: `lab:${biome.id}:${generation}`,
        rect: { x: 0, y: 0, width, height },
        biome,
        features,
      })
    }

    const caption = document.createElement('figcaption')
    caption.innerHTML = `<strong>${biome.label}</strong><br>${biome.describe}`
    figure.append(canvas, caption)
    grid.append(figure)
  }
}

render()
