/**
 * Builds a canonical {@link GenotypeKey} exactly as `src/genetics/types.ts` documents it:
 * non-null alleles, sorted, joined by `/`.
 *
 * Content files use this instead of hand-sorting allele ids when writing
 * `ExpressionTable.entries` keys. A hand-sorted key that is wrong in one letter's order
 * silently becomes a row that can never match — this makes the mistake impossible instead
 * of easy to make.
 *
 * `key()` (no arguments) is the key for a sex-linked locus in the sex that does not carry
 * the chromosome it sits on — both slots are `null`, so no alleles are present at all.
 */
export function key(...alleles: readonly (string | null)[]): string {
  return alleles
    .filter((a): a is string => a !== null)
    .slice()
    .sort()
    .join('/')
}
