import type { ConfiguredEntityType, RelationDefinition } from './configuration'

export interface RelationRow {
  id: string
  name: string
  direction: 'outgoing' | 'incoming'
  definition: RelationDefinition
  ownerId: string
  ownerName: string
  linkedTypes: string[]
  cardinality: string
}

function cardinality(sourceMax: 1 | null, targetMax: 1 | null) {
  if (sourceMax === 1)
    return targetMax === 1 ? 'Un vers un' : 'Plusieurs vers un'
  return targetMax === 1 ? 'Un vers plusieurs' : 'Plusieurs vers plusieurs'
}

export function relationRows(
  typeId: string,
  catalog: ConfiguredEntityType[],
): RelationRow[] {
  const direct: RelationRow[] = []
  const inverse: RelationRow[] = []
  for (const owner of catalog) {
    for (const relation of owner.configuration.relations) {
      const common = {
        id: relation.id,
        definition: relation,
        ownerId: owner.id,
        ownerName: owner.name,
      }
      if (owner.id === typeId)
        direct.push({
          ...common,
          name: relation.name,
          direction: 'outgoing',
          linkedTypes: relation.target_type_ids.map(
            (id) =>
              catalog.find((target) => target.id === id)?.name ??
              'Type indisponible',
          ),
          cardinality: cardinality(relation.source_max, relation.target_max),
        })
      if (relation.target_type_ids.includes(typeId))
        inverse.push({
          ...common,
          name: relation.inverse_name,
          direction: 'incoming',
          linkedTypes: [owner.name],
          cardinality: cardinality(relation.target_max, relation.source_max),
        })
    }
  }
  return [...direct, ...inverse]
}
