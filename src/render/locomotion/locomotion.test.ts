/**
 * The properties this directory exists to guarantee.
 *
 * Two of these tests are the reason the whole path-following design was chosen over a wave
 * applied to the body, so if you are ever tempted to simplify `headPath.ts` away, read them
 * first: **a stationary snake does not move**, and **the tail passes through the head's line**.
 * A sine wave across a straight body fails both, and no amount of tuning fixes either.
 */

import { describe, it, expect } from 'vitest'
import { HeadPath } from './headPath'
import { Locomotor } from './locomotor'
import { Behaviour } from './behaviour'
import type { Bounds } from './driver'
import { vec, type Vec2 } from '../geometry'

const BOUNDS: Bounds = { x: 0, y: 0, width: 240, height: 200 }

function locomotor(seed: string, still = false): Locomotor {
  return new Locomotor({
    seed,
    bounds: BOUNDS,
    pointCount: 40,
    segLength: 4,
    bodyWidth: 9,
    cruiseSpeed: 34,
    still,
  })
}

function snapshot(points: readonly Vec2[]): Vec2[] {
  return points.map((p) => vec(p.x, p.y))
}

function maxShift(a: readonly Vec2[], b: readonly Vec2[]): number {
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y))
  return worst
}

describe('HeadPath', () => {
  it('samples a straight run at the distance asked for', () => {
    const path = new HeadPath(200, 1)
    for (let x = 0; x <= 150; x += 1) path.push(x, 50)

    const out: Vec2[] = []
    path.sampleBack([0, 10, 40, 100], out)

    expect(out[0].x).toBeCloseTo(150, 6)
    expect(out[1].x).toBeCloseTo(140, 6)
    expect(out[2].x).toBeCloseTo(110, 6)
    expect(out[3].x).toBeCloseTo(50, 6)
    for (const p of out) expect(p.y).toBeCloseTo(50, 6)
  })

  it('follows a corner rather than cutting across it', () => {
    const path = new HeadPath(200, 1)
    for (let x = 0; x <= 50; x += 1) path.push(x, 0)
    for (let y = 1; y <= 50; y += 1) path.push(50, y)

    const out: Vec2[] = []
    // 60 back from the head means 50 up the vertical leg and 10 along the horizontal one.
    path.sampleBack([60], out)
    expect(out[0].x).toBeCloseTo(40, 6)
    expect(out[0].y).toBeCloseTo(0, 6)
  })

  it('keeps the head exact even when it creeps by less than one stored step', () => {
    const path = new HeadPath(100, 5)
    path.push(0, 0)
    path.push(20, 0)
    path.push(20.3, 0)
    path.push(20.7, 0)

    const out: Vec2[] = []
    path.sampleBack([0], out)
    expect(out[0].x).toBeCloseTo(20.7, 9)
    // …and does not inflate the recorded distance by accumulating those sub-steps.
    expect(path.travelled).toBeCloseTo(20.7, 9)
  })

  it('records nothing at all when the head does not move', () => {
    const path = new HeadPath(100, 1)
    path.push(10, 10)
    path.push(20, 10)
    const before = path.samples().length
    for (let i = 0; i < 50; i++) path.push(20, 10)
    expect(path.samples().length).toBe(before)
    expect(path.travelled).toBeCloseTo(10, 9)
  })
})

describe('Locomotor', () => {
  it('is exactly still while it is not travelling — no ambient wiggle', () => {
    const move = locomotor('still-check')
    // Run until it settles into a stationary state, then check nothing drifts.
    let ticks = 0
    while (move.state !== 'rest' && ticks < 6000) {
      move.update(1 / 60)
      ticks++
    }
    // Let the smoothed speed reach zero.
    for (let i = 0; i < 240; i++) move.update(1 / 60)

    const before = snapshot(move.points)
    for (let i = 0; i < 120 && move.state === 'rest'; i++) move.update(1 / 60)
    expect(maxShift(before, move.points)).toBe(0)
  })

  it('never moves at all when told to hold still', () => {
    const move = locomotor('reduced-motion', true)
    const before = snapshot(move.points)
    for (let i = 0; i < 600; i++) move.update(1 / 60)
    expect(maxShift(before, move.points)).toBe(0)
  })

  it('starts coiled rather than as a straight stick', () => {
    const move = locomotor('coiled-at-birth', true)
    const head = move.points[0]
    const tail = move.points[move.points.length - 1]
    const bodyLength = 4 * 39
    // A straight body would put the tail a whole body length away. A coil folds it back in.
    expect(Math.hypot(head.x - tail.x, head.y - tail.y)).toBeLessThan(bodyLength * 0.5)
  })

  it('puts the body on the line the head travelled, not beside it', () => {
    const move = locomotor('follow-the-leader')
    const trail: Vec2[] = []

    // Drive it long enough to be travelling, recording where the head goes.
    for (let i = 0; i < 4000; i++) {
      move.update(1 / 60)
      if (move.state === 'travel') trail.push(vec(move.points[0].x, move.points[0].y))
      if (trail.length > 900) break
    }
    expect(trail.length).toBeGreaterThan(200)

    // Every body point must sit on the recorded head trail. If a wave were being applied across
    // the body instead, mid-body points would stand off the trail by the wave's amplitude.
    for (let i = 1; i < move.points.length; i++) {
      expect(distanceToPolyline(move.points[i], trail)).toBeLessThan(1.5)
    }
  })

  it('holds the segment spacing the body was built with', () => {
    const move = locomotor('spacing')
    for (let i = 0; i < 3000; i++) move.update(1 / 60)
    for (let i = 1; i < move.points.length; i++) {
      const gap = Math.hypot(
        move.points[i].x - move.points[i - 1].x,
        move.points[i].y - move.points[i - 1].y,
      )
      // Sampling a polyline by arc length gives a chord slightly shorter than the arc on a bend.
      expect(gap).toBeGreaterThan(4 * 0.9)
      expect(gap).toBeLessThan(4 * 1.02)
    }
  })

  it('stays inside its enclosure', () => {
    const move = locomotor('bounded')
    for (let i = 0; i < 12000; i++) {
      move.update(1 / 60)
      const head = move.points[0]
      expect(head.x).toBeGreaterThan(BOUNDS.x - 12)
      expect(head.x).toBeLessThan(BOUNDS.x + BOUNDS.width + 12)
      expect(head.y).toBeGreaterThan(BOUNDS.y - 12)
      expect(head.y).toBeLessThan(BOUNDS.y + BOUNDS.height + 12)
    }
  })

  it('is reproducible from its seed and different between seeds', () => {
    const a = locomotor('same-seed')
    const b = locomotor('same-seed')
    const c = locomotor('other-seed')
    for (let i = 0; i < 1500; i++) {
      a.update(1 / 60)
      b.update(1 / 60)
      c.update(1 / 60)
    }
    expect(maxShift(a.points, b.points)).toBe(0)
    expect(maxShift(a.points, c.points)).toBeGreaterThan(1)
  })
})

describe('Behaviour', () => {
  const world = {
    bounds: BOUNDS,
    obstacles: [],
    bodyLength: 156,
    bodyWidth: 9,
    cruiseSpeed: 34,
  }

  it('spends most of its life resting', () => {
    let resting = 0
    let total = 0
    for (let n = 0; n < 12; n++) {
      const behaviour = new Behaviour(`snake-${n}`, world)
      let head = { position: vec(120, 100), course: 0, moved: 0 }
      for (let i = 0; i < 60 * 600; i++) {
        const command = behaviour.update(1 / 60, head)
        const moved = command.speed / 60
        head = {
          position: vec(head.position.x, head.position.y),
          course: head.course,
          moved,
        }
        if (behaviour.name === 'rest') resting++
        total++
      }
    }
    // Ten minutes each, twelve animals. Rest has to dominate or a floor of nine is a fidget.
    expect(resting / total).toBeGreaterThan(0.45)
  })

  it('asks for no movement and no weave while resting', () => {
    const behaviour = new Behaviour('resting-still', world, 'rest')
    const command = behaviour.update(1 / 60, { position: vec(120, 100), course: 0, moved: 0 })
    expect(command.speed).toBe(0)
    expect(command.weaveAmplitude).toBe(0)
  })

  it('staggers animals so a floor never moves in unison', () => {
    const states = new Set<string>()
    for (let n = 0; n < 9; n++) {
      const behaviour = new Behaviour(`habitat-snake-${n}`, world)
      let seen = ''
      for (let i = 0; i < 60 * 40; i++) {
        behaviour.update(1 / 60, { position: vec(120, 100), course: 0, moved: 0 })
        if (i % 600 === 0) seen += behaviour.name[0]
      }
      states.add(seen)
    }
    // Nine identical trajectories would mean the seeding is not reaching the state machine.
    expect(states.size).toBeGreaterThan(3)
  })
})

/** Shortest distance from a point to a polyline. Used to prove the body sits on the head's track. */
function distanceToPolyline(p: Vec2, line: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)))
  }
  return best
}
