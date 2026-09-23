/*
 * EvidenceReference — a stable, typed pointer from a claim to where it came from.
 *
 * CONTEXT.md is explicit that a filename-only label does not count. The two
 * shapes below are different kinds of thing and are kept apart so the UI can
 * colour them differently (vault vs external) and so egress rules can be
 * enforced mechanically: a Wikipedia query is built from external references
 * and public topic terms, never from a vault reference's contents.
 *
 * `granularity` is deliberately note-level for now. ROADMAP open decision 7 —
 * note, heading, block or range — is unresolved, and widening it later is an
 * additive change to this union.
 */

export interface VaultEvidenceReference {
  readonly kind: "vault"
  /** Vault-relative path, as Obsidian's Vault API reports it. */
  readonly path: string
  /** Heading the excerpt sat under, when one was identified. */
  readonly heading?: string
  readonly excerpt: string
}

export interface ExternalEvidenceReference {
  readonly kind: "external"
  /** Only Wikipedia in the MVP. The field exists so the UI can name the source. */
  readonly source: "wikipedia"
  readonly title: string
  /** Canonical page URL, which is what the sources panel links to. */
  readonly url: string
  readonly excerpt: string
}

export type EvidenceReference = VaultEvidenceReference | ExternalEvidenceReference

/**
 * Identity for deduplication. PRODUCT.md acceptance criterion 4 requires
 * selected evidence to be deduplicated, and two retrievals of the same note
 * must collapse even when their excerpts differ.
 */
export function referenceKey(reference: EvidenceReference): string {
  return reference.kind === "vault"
    ? `vault:${reference.path}#${reference.heading ?? ""}`
    : `external:${reference.source}:${reference.url}`
}

export function dedupe(references: readonly EvidenceReference[]): EvidenceReference[] {
  const seen = new Map<string, EvidenceReference>()
  for (const reference of references) {
    const key = referenceKey(reference)
    // First one wins: retrieval order carries the ranking.
    if (!seen.has(key)) seen.set(key, reference)
  }
  return [...seen.values()]
}
