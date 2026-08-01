/**
 * The market: what your animals are worth, and why.
 *
 * The "why" column is the point. A price that is just a number teaches a player to chase the
 * number; a price broken into rarity, saturation and vigor teaches them what the economy is
 * actually made of — and the answer, deliberately, is *find something new* rather than *do more
 * of what worked*, because saturation makes the second one stop paying.
 *
 * Note what is **not** here: no cost per resident. Taxing care would make the rehab's own mission
 * the tax and put callousness on the optimal line, which is both bad design and the wrong game.
 * Saturation taxes scale instead.
 */
import { unitsAbsorbed, rarityTierOf } from '../game/market'
import { percent, type Session } from '../game/session'
import { BASE_PRICE_BY_TIER, RARITY_TIERS, SATURATION_HALFLIFE_SALES } from '../game/tuning'
import type { SnakeRecord } from '../game/roster'
import { SnakeCanvas } from './SnakeCanvas'

export interface MarketProps {
  readonly session: Session
  readonly onSold: (record: SnakeRecord, price: number) => void
}

export function Market({ session, onSold }: MarketProps) {
  const residents = session.residents()

  return (
    <div className="market">
      <p className="muted small">
        Value is rarity, decayed by how many of that exact look the market has already absorbed
        (halving every {SATURATION_HALFLIFE_SALES}), scaled by vigor. Flood the market with one morph
        and its price falls until flooding it stops being worth doing.
      </p>

      <div className="listings">
        {residents.map((record) => {
          const phenotype = session.phenotype(record)
          const species = session.speciesOf(record)
          const key = species.playable.phenotypeKey(phenotype)
          const absorbed = unitsAbsorbed(session.saturation, key, session.turn)
          const tier = rarityTierOf(phenotype)
          const price = session.valueOf(record)
          return (
            <div className="listing" key={record.individual.id}>
              <SnakeCanvas phenotype={phenotype} age={session.ageOf(record)} width={180} height={110} />
              <div className="listing-body">
                <strong>{record.name}</strong>
                <span className="muted small">
                  {RARITY_TIERS[tier - 1]?.label ?? 'common'} · base ${BASE_PRICE_BY_TIER[tier - 1]}
                </span>
                <span className="muted small">
                  market has absorbed {absorbed.toFixed(1)} of this look
                </span>
                <span className="muted small">vigor {percent(session.vigorOf(record))}</span>
              </div>
              <button
                className="primary"
                onClick={() => {
                  const sold = session.sell(record.individual.id)
                  onSold(record, sold)
                }}
              >
                Sell ${price}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
