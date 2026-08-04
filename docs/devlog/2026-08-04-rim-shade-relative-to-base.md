# 2026-08-04 — the rim shade is relative to the animal now, and the shadow got to relax

## What I worked on

`drawRoundness` shaded the body's rim toward `rgba(20, 14, 24)` at a fixed 22%, whatever colour the
animal was. That is the right instinct for a pale snake and exactly backwards for a dark one: a dark
base has no room left to darken, so the outline came out *darker than the body it outlined*, and on
peat there was nothing to see. That is the "is he see-through?" report — the body is a provably
opaque fill; it was the edge that had no contrast in it.

The rim now shades **away from whichever end the base colour is already near**: dark base gets a rim
light, pale base keeps the darkening it had (`src/render/life/paint.ts`, `RIM_SHADE` / `rimStroke`).
`snake.ts`'s private copy of the same pass is gone — it calls the shared one.

## Measurements

`edge-contrast-probe.html` + `src/habitat/lab/edgeContrast.ts`. Weber contrast
`|rim − surround| / max(rim, surround)` between the animal's rim band and the ring of substrate just
outside it, on flat fills of both cypress-margin substrate colours, at `dpr` 2. `relief` is
`rim − core`: which way the tube-rounding illusion actually points.

Worst case across the four fixtures × both substrates:

| | shadow 0.06/0.30 | shadow 0.03/0.22 |
|---|---|---|
| absolute rim | **0.162** (shipped) | 0.204 |
| relative rim | 0.267 | **0.229** (ships now) |

Starlight, the fixture the whole thing is about (`baseColour rgba(38, 34, 66)`, luminance 0.15):

| | rim | core | relief | vs cypress | vs cypress-dark |
|---|---|---|---|---|---|
| absolute rim | 67.9 | 94.9 | **−27.0** | 0.162 | 0.271 |
| relative rim | 110.6 | 94.9 | **+15.6** | 0.229 | 0.528 |

## Decisions, and why

- **The direction is a step, not a ramp.** Any continuous path from "rim darker" to "rim lighter"
  passes through "rim identical to the core", so a crossfade has a dead band of base colours with no
  rim at all — and Garter (luminance 0.30) is close enough to the crossover to fall in it. A step
  keeps the magnitude constant and only flips the sign, and either sign reads as an edge.
- **The flip is 0.45**, which is the middle of the widest gap in what is actually authored: every
  shipped fixture sits in 0.15–0.39 or 0.52–0.89. `paint.test.ts` fails if a new morph lands on it,
  and the fix for that is to move the flip, not to widen the tolerance. (It was 0.4 first; the test
  caught `Combo — albino + piebald` sitting 0.013 away.)
- **The lighten side is much stronger than the darken side** (0.8 at α 0.30 vs 0.4 at α 0.22), and it
  has to be for two measured reasons. A dark base has little luminance to push around, so the mirror
  image of the darken side moved Starlight's rim by ten steps and left it still below its own core.
  And a `glow` morph lights the ground it lies on: the substrate ring within a body width of a
  Starlight reads 85 where the bare fill reads 72, so a rim that only just beats the substrate lands
  inside the animal's own halo and goes soft on the *pale* biome instead of the dark one. Swept
  6 × 5 over amount × alpha before picking.
- **`CONTACT_SHADOW_PASSES` came down, 0.06/0.30 → 0.03/0.22.** Those alphas were a saddle: the
  shadow was the only thing supplying a silhouette on a dark biome, and pushing it further dissolved
  the silhouette on a pale one. With the rim carrying its own weight the surface is *monotonic* in
  both alphas — every pair in the swept grid, down to no shadow at all (0.132), clears the ~0.10
  where a boundary stops reading. So the alphas are picked for the only thing a contact shadow was
  ever for, contact, and they are as light as they can be while the animal still reads as resting on
  the substrate rather than pasted over it. At the old values the skirt reads as a ring of grime
  around a pale animal on a pale biome; at zero it floats.

## Bugs

- **The probe was measuring shadowless animals and reporting them as shipped.** `withShadowPasses`
  emptied `CONTACT_SHADOW_PASSES` before copying its argument — and the argument, in the most
  natural call in the file, *is* `CONTACT_SHADOW_PASSES`. Every number in measurement B was a
  no-shadow number for an hour. Copy first, then truncate.
- The two copies of `drawRoundness` had already drifted: only the shared one guarded a degenerate
  ribbon. Nobody would ever have seen it — no screen shows both renderers at once — which is the
  argument against keeping the copy, not for it.

## Next

`portrait.ts` draws no rim at all, so a snake in the binder is shaded differently from the same snake
in its enclosure. Unrelated to this change and older than it, but it is the next thing in this area.

Otherwise see [`state-of-play.md`](../state-of-play.md).
