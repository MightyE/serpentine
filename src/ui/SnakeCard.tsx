/**
 * One snake, in full: the card, and the file behind it.
 *
 * This screen is the reason the project exists, and the thing it has to get right is the split
 * between **what is known** and **what is true**. A game that prints the genotype has taught
 * nothing: real keepers do not know what their animals carry, they infer it, and the inference is
 * the interesting part. So every locus shows the *belief* — and, where that belief is a
 * probability, the arithmetic that produced it, spelled out in a sentence.
 *
 * "66% possible het" is a posterior, not a measurement. Of four equally likely outcomes from a
 * carrier × carrier pairing, one is visibly affected and is ruled out the moment you look at the
 * animal, leaving two carriers out of the three that look normal. That is what this panel shows,
 * and nothing in it hard-codes 0.66.
 *
 * ## Presentation note
 *
 * Everything the old audit-table version showed is still here — the per-locus belief, the full
 * distribution, the derivation sentence, the gene-test cost, the pedigree, the F value and its
 * explanation. What changed is that `PROVEN` and `INFERRED` now read like a detective's notebook
 * (emerald for what you have earned, gold for what is still open) instead of like a compliance
 * finding, and the animal arrives as a card you turn over rather than as a header image.
 */
import { useState } from 'react'
import { isLoadLocus } from '../game/loadPool'
import { percent, type Session } from '../game/session'
import { noticeName } from '../game/cheats'
import type { SnakeRecord } from '../game/roster'
import type { LocusBelief } from '../genetics/types'
import { GenomeCard } from './GenomeCard'

function describeBeliefKind(belief: LocusBelief | undefined): string {
  if (!belief) return 'unknown'
  if (belief.kind === 'certain') return 'proven'
  if (belief.kind === 'posterior') return 'inferred'
  return 'unknown'
}

/**
 * The sentence under a "possible het" number.
 *
 * Written from the evidence rather than from a template with the number substituted in, so a
 * player can check it. If this ever says something the numbers do not, one of the two is a bug
 * and the sentence is how you would notice.
 */
function derivation(record: SnakeRecord, session: Session, locusId: string): string {
  const evidence = session.evidenceFor(record.individual.id)
  const parentage = evidence.find((e) => e.kind === 'parentage')
  const looked = evidence.some((e) => e.kind === 'observedPhenotype')

  const parts: string[] = []
  const tested = evidence.some((e) => e.kind === 'geneTest' && e.locus === locusId)
  if (tested) {
    return 'A gene test read this locus directly, so there is nothing left to infer.'
  }
  if (parentage && parentage.kind === 'parentage') {
    const mother = session.record(parentage.mother)
    const father = session.record(parentage.father)
    parts.push(
      `Its parents were ${mother?.name ?? 'an animal no longer here'} and ${father?.name ?? 'an animal no longer here'}, ` +
        'so it started as a split over everything they could have passed on at this locus, ' +
        'weighted by what you had already proved about them.',
    )
  } else {
    parts.push('Nothing is known about where this animal came from, so every genotype starts equally likely.')
  }
  if (looked) {
    parts.push(
      'Then you looked at it. Every genotype that would have made it look different is ruled out, ' +
        'and what is left is renormalised — which is the whole of where the percentage comes from.',
    )
  }
  parts.push(`Prove it with a test breeding, or a gene test, and “${locusId}” becomes certain instead.`)
  return parts.join(' ')
}

export interface SnakeCardProps {
  readonly session: Session
  readonly record: SnakeRecord
  readonly onClose?: () => void
  readonly onSell?: () => void
}

export function SnakeCard({ session, record, onClose, onSell }: SnakeCardProps) {
  const [name, setName] = useState(record.name)
  const [openLocus, setOpenLocus] = useState<string | null>(null)

  const species = session.speciesOf(record)
  const phenotype = session.phenotype(record)
  const sex = session.sexOf(record)
  const f = session.inbreedingOf(record)
  const vigor = session.vigorOf(record)
  const value = session.valueOf(record)
  const age = session.ageOf(record)
  const load = session.expressedLoadOf(record)
  const revealed = session.state.flags.get('revealGenotypes') === true
  const knowledge = session.knowledgeOf(record)

  const parents = (record.individual.parents ?? []).map((id) => ({ id, record: session.record(id) }))

  const commitName = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === record.name) return
    session.rename(record.individual.id, trimmed)
    noticeName(session, trimmed)
  }

  return (
    <div className="dossier">
      <div className="dossier-card">
        <GenomeCard session={session} record={record} size="hero" autoReveal />
        {onClose && (
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="dossier-body">
        <div className="dossier-title">
          <div className="row">
            <input
              className="name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              aria-label="name"
              title={name}
            />
          </div>
          <p className="morph">{phenotype.label}</p>
          <p className="muted small mono">
            {species.authored.label} · {sex} · {age >= 1 ? 'grown' : age > 0.55 ? 'juvenile' : 'hatchling'}
          </p>
        </div>

        <div className="stat-row">
          <Stat label="Value" value={`$${value}`} hint="Rarity, minus what the market has already absorbed, times vigor." />
          <Stat
            label="Inbreeding (F)"
            value={f === 0 ? '0' : f.toFixed(3)}
            hint="The chance its two copies at a locus came from the same ancestor. 0.25 is a full-sib pairing."
          />
          <Stat
            label="Vigor"
            value={percent(vigor)}
            hint="A readout, not a rule: diversity minus whatever load it actually expresses. Nothing in the biology reads it."
          />
        </div>

        {load.length > 0 && (
          <div className="needs-care">
            <strong>Needs extra care</strong>
            <p>{load[0]!.explanation}</p>
            <button onClick={() => session.giveCareTo(record.individual.id)}>Spend time with it</button>
          </div>
        )}

        <section className="notebook">
          <h3>The notebook — what you know, and what is actually true</h3>
          <p className="muted small">
            A keeper does not know what an animal carries; they infer it. Open a locus to see where its number
            comes from.
          </p>

          <div className="loci">
            {species.authored.loci
              .filter((locus) => !isLoadLocus(locus.id))
              .map((locus) => {
                const belief = knowledge.loci[locus.id]
                const rows = session.carrierBreakdown(record, locus.id)
                const actual = record.individual.genotype.loci[locus.id]
                const open = openLocus === locus.id
                const kind = describeBeliefKind(belief)
                return (
                  <div className={`locus ${open ? 'open' : ''}`} key={locus.id}>
                    <button
                      className="locus-head"
                      onClick={() => setOpenLocus(open ? null : locus.id)}
                      aria-expanded={open}
                    >
                      <span className="locus-name">{locus.label}</span>
                      <span className={`chip ${kind}`}>{kind}</span>
                      <span className="locus-belief">
                        {rows
                          .filter((r) => r.probability > 0.001)
                          .slice(0, 2)
                          .map((r) => `${percent(r.probability)} ${r.label}`)
                          .join(' · ')}
                      </span>
                      <span className="locus-actual">
                        {revealed && actual ? actual.map((a) => a ?? '—').join(' / ') : ''}
                      </span>
                    </button>

                    {open && (
                      <div className="why">
                        <table className="breakdown">
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.key}>
                                <td className="mono">{r.label}</td>
                                <td>
                                  <div className="bar">
                                    <span style={{ width: `${Math.round(r.probability * 100)}%` }} />
                                  </div>
                                </td>
                                <td className="num">{percent(r.probability, 1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="small">{derivation(record, session, locus.id)}</p>
                        {belief?.kind !== 'certain' && (
                          <button
                            onClick={() => {
                              if (!session.geneTest(record.individual.id, locus.id)) {
                                window.alert(`A gene test costs $${session.geneTestCost}.`)
                              }
                            }}
                          >
                            Gene test this locus — ${session.geneTestCost}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>

        <section>
          <h3>Pedigree</h3>
          {parents.length === 0 ? (
            <p className="muted small">
              A founder — it arrived from the wild population with no known parents, which is why its F is 0 and
              why it is the most useful thing in the building for outcrossing.
            </p>
          ) : (
            <ul className="pedigree-list">
              {parents.map((p) => (
                <li key={p.id}>
                  {p.record ? `${p.record.name} (${session.sexOf(p.record)})` : `${p.id} — no longer here`}
                </li>
              ))}
            </ul>
          )}
        </section>

        {onSell && (
          <div className="card-actions">
            <button className="primary" onClick={onSell}>
              Sell for ${value}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="stat" title={hint}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
