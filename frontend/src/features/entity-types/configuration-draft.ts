import type {
  DefinitionItem,
  DefinitionKind,
  DisplayProfile,
  EntityConfiguration,
  ViewDefinition,
} from './configuration'

export const definitionKinds: DefinitionKind[] = [
  'fields',
  'relations',
  'display_profiles',
  'views',
]

type Defaultable = DisplayProfile | ViewDefinition
const hasDefault = (kind: DefinitionKind) =>
  kind === 'views' || kind === 'display_profiles'

/**
 * Number of definitions added, changed or removed; a pure reordering of a kind
 * counts as one change.
 */
export function countDraftChanges(
  base: EntityConfiguration,
  draft: EntityConfiguration,
): number {
  return definitionKinds.reduce((total, kind) => {
    const before = new Map(
      base[kind].map((item) => [item.id, JSON.stringify(item)]),
    )
    const after = new Map(
      draft[kind].map((item) => [item.id, JSON.stringify(item)]),
    )
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (id) => before.get(id) !== after.get(id),
    ).length
    const reordered =
      base[kind].map((item) => item.id).join(',') !==
      draft[kind].map((item) => item.id).join(',')
    return total + (changed || (reordered ? 1 : 0))
  }, 0)
}

/** Insert or replace a definition, keeping exactly one default when needed. */
export function putDefinition(
  configuration: EntityConfiguration,
  kind: DefinitionKind,
  item: DefinitionItem,
): EntityConfiguration {
  const existing = configuration[kind] as DefinitionItem[]
  const next = existing.some((value) => value.id === item.id)
    ? existing.map((value) => (value.id === item.id ? item : value))
    : [...existing, item]
  if (!hasDefault(kind)) return { ...configuration, [kind]: next }
  const defaultId = (item as Defaultable).is_default
    ? item.id
    : ((next as Defaultable[]).find((value) => value.is_default)?.id ??
      next[0]?.id)
  return {
    ...configuration,
    [kind]: next.map((value) => ({
      ...value,
      is_default: value.id === defaultId,
    })),
  }
}

/** Remove a definition, promoting the first remaining one if it was default. */
export function removeDefinition(
  configuration: EntityConfiguration,
  kind: DefinitionKind,
  id: string,
): EntityConfiguration {
  const next = configuration[kind].filter((value) => value.id !== id)
  if (
    hasDefault(kind) &&
    next.length &&
    !(next as Defaultable[]).some((value) => value.is_default)
  )
    return {
      ...configuration,
      [kind]: next.map((value, i) => ({ ...value, is_default: i === 0 })),
    }
  return { ...configuration, [kind]: next }
}
