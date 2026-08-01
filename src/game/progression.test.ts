import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from './eventBus'
import { createFlagSet } from './flagSet'
import { createUnlockRegistry } from './unlockRegistry'

describe('EventBus', () => {
  it('on/emit delivers the payload; unsubscribe stops delivery', () => {
    const bus = createEventBus()
    const seen: number[] = []
    const unsubscribe = bus.on('turn.advanced', (e) => seen.push(e.turn))
    bus.emit('turn.advanced', { turn: 1 })
    unsubscribe()
    bus.emit('turn.advanced', { turn: 2 })
    expect(seen).toEqual([1])
  })

  it('once fires exactly one time', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    bus.once('turn.advanced', handler)
    bus.emit('turn.advanced', { turn: 1 })
    bus.emit('turn.advanced', { turn: 2 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a throwing handler is caught and logged, not left to break the bus', () => {
    const bus = createEventBus()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.on('turn.advanced', () => {
      throw new Error('boom')
    })
    const secondHandler = vi.fn()
    bus.on('turn.advanced', secondHandler)
    expect(() => bus.emit('turn.advanced', { turn: 1 })).not.toThrow()
    expect(secondHandler).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})

describe('FlagSet', () => {
  it('set/get/has round-trip and emit flag.changed only on an actual change', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus)
    const changes: unknown[] = []
    bus.on('flag.changed', (e) => changes.push(e))

    expect(flags.has('seen')).toBe(false)
    flags.set('seen', true)
    flags.set('seen', true) // no-op, same value
    expect(flags.get('seen')).toBe(true)
    expect(changes).toEqual([{ flag: 'seen', value: true }])
  })

  it('bump treats a missing counter as 0', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus)
    expect(flags.bump('clutchesHatched')).toBe(1)
    expect(flags.bump('clutchesHatched', 4)).toBe(5)
  })

  it('all() reflects everything set so far', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus, { seeded: 'yes' })
    flags.set('extra', 3)
    expect(flags.all()).toEqual({ seeded: 'yes', extra: 3 })
  })
})

describe('UnlockRegistry — the talent-tree seam, unused', () => {
  it('evaluates from current flags rather than storing an unlocked bit', () => {
    const bus = createEventBus()
    const flags = createFlagSet(bus)
    const unlocks = createUnlockRegistry()
    unlocks.register({
      id: 'market-access',
      label: 'Market Access',
      description: 'Unlocks buying and selling.',
      requires: [
        {
          describe: 'Hatch your first clutch',
          isMet: (view) => view.count('clutchesHatched') >= 1,
        },
      ],
      grants: ['market'],
    })

    const view = { flag: (id: string) => flags.get(id), count: (id: string) => Number(flags.get(id) ?? 0), isUnlocked: (id: string) => unlocks.isUnlocked(id, view) }
    expect(unlocks.isUnlocked('market-access', view)).toBe(false)
    expect(unlocks.pending(view)).toHaveLength(1)

    flags.bump('clutchesHatched')
    expect(unlocks.isUnlocked('market-access', view)).toBe(true)
    expect(unlocks.evaluate(view).map((u) => u.id)).toEqual(['market-access'])
    expect(unlocks.pending(view)).toHaveLength(0)
  })

  it('registering a duplicate id throws', () => {
    const unlocks = createUnlockRegistry()
    const unlock = { id: 'dup', label: 'Dup', description: '', requires: [], grants: [] }
    unlocks.register(unlock)
    expect(() => unlocks.register(unlock)).toThrow()
  })
})
