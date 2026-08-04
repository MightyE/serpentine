/**
 * The floor lab: a full room of enclosures with animals in them, and a frame-cost readout.
 *
 * Dev-only, not React, same shape as the other three labs. Its jobs:
 *
 * 1. **Look at the locomotion.** Nine animals at once is the only way to tell whether a floor is
 *    calm. One snake in a big box always looks fine.
 * 2. **Measure the budget.** The habitat capacity rules cap the floor at one animal per grid
 *    cell, so "full occupancy" is a number the game defines rather than a stress test somebody
 *    invented. The readout is `FloorAnimator.stats`, which is the same instrument the app uses.
 *
 * Open `floor-lab.html`.
 */

import '../../index'
import { biomeRegistry, featureRegistry } from '../../registry'
import type { FeatureProvision } from '../../contract'
import { FIXTURES } from '../../../render/lab/fixtures'
import { LivingHabitat, floorAnimator, prefersReducedMotion } from '../index'
import type { OccupantSpec } from '../index'

/** The starting room: three by three. Every cell holds an animal, which is the game's own ceiling. */
const COLUMNS = 3
const ROWS = 3
const FEATURES = ['cork-hide', 'water-bowl', 'climbing-branch']

const root = document.getElementById('lab')
if (!root) throw new Error('floor lab: no #lab element')

let still = prefersReducedMotion()
let perEnclosure = 1
const live: LivingHabitat[] = []

function features(): FeatureProvision[] {
  return FEATURES.map((id) => featureRegistry.get(id)).filter((f): f is FeatureProvision => f !== undefined)
}

function occupantsFor(index: number, count: number): OccupantSpec[] {
  const out: OccupantSpec[] = []
  for (let n = 0; n < count; n++) {
    const phenotype = FIXTURES[(index * 3 + n) % FIXTURES.length]
    out.push({
      id: `lab-snake-${index}-${n}`,
      name: `${phenotype.label} ${index}-${n}`,
      phenotype,
      // A spread of ages, so the size relationship between a hatchling and an adult in the same
      // room is visible rather than asserted.
      age: n === 1 ? 0.22 : ((index * 7 + n * 3) % 10) / 10 * 0.6 + 0.4,
    })
  }
  return out
}

function render(): void {
  if (!root) return
  for (const view of live) view.destroy()
  live.length = 0
  root.innerHTML = ''
  floorAnimator.resetStats()

  const bar = document.createElement('div')
  bar.className = 'toolbar'

  const motion = document.createElement('button')
  motion.textContent = still ? 'reduced motion: on' : 'reduced motion: off'
  motion.className = still ? 'on' : ''
  motion.onclick = () => {
    still = !still
    render()
  }
  bar.append(motion)

  for (const n of [1, 2, 3]) {
    const button = document.createElement('button')
    button.textContent = `${n} per enclosure`
    button.className = n === perEnclosure ? 'on' : ''
    button.onclick = () => {
      perEnclosure = n
      render()
    }
    bar.append(button)
  }

  const status = document.createElement('span')
  status.className = 'status'
  bar.append(status)
  root.append(bar)

  const floor = document.createElement('div')
  floor.className = 'floor'
  root.append(floor)

  const biomes = biomeRegistry.list()
  for (let i = 0; i < COLUMNS * ROWS; i++) {
    const cell = document.createElement('div')
    cell.className = 'cell'
    const canvas = document.createElement('canvas')
    cell.append(canvas)
    floor.append(cell)

    const biome = biomes[i % biomes.length]
    live.push(
      new LivingHabitat(canvas, {
        enclosure: { id: `lab-habitat-${i}`, biome, features: features() },
        occupants: occupantsFor(i, perEnclosure),
        still,
        onPick: (id) => {
          for (const view of live) view.setSelected(id)
        },
      }),
    )
  }

  const tick = (): void => {
    const stats = floorAnimator.stats
    status.textContent =
      `${stats.enclosures} enclosures · ${stats.animals} animals · ` +
      `${stats.frameMs.toFixed(2)} ms/frame (worst ${stats.worstMs.toFixed(2)}) · ` +
      `${stats.frames} frames`
    if (root.contains(status)) window.setTimeout(tick, 250)
  }
  tick()
}

render()
