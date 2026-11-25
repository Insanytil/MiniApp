import { fieldKinds, navigations } from './configuration'
import type {
  ConfiguredEntityType,
  DisplayProfile,
  Navigation,
  ViewColumn,
} from './configuration'
import { viewColumnKey } from './view-column-order'

export const MAX_VIEW_COLUMNS = 50
export const columnChoiceGroups = [
  'Champs',
  'Champs système',
  'Relations',
  'Présentation',
] as const

export interface ColumnChoice {
  key: string
  label: string
  group: (typeof columnChoiceGroups)[number]
  detail: string
  kind: 'field' | 'relation' | 'display'
  fieldId?: string
  relationId?: string
  direction?: 'outgoing' | 'incoming'
}

/** Everything a view column can be resolved against for a given type. */
export interface ColumnContext {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  fields: ConfiguredEntityType['available_system_fields']
  paths: Navigation[]
  choices: ColumnChoice[]
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()

export function columnContext(
  type: ConfiguredEntityType,
  catalog: ConfiguredEntityType[],
): ColumnContext {
  const fields = [...type.configuration.fields, ...type.available_system_fields]
  const paths = navigations(type.id, catalog)
  const choices: ColumnChoice[] = [
    ...fields.map((field): ColumnChoice => ({
      key: `field:${field.id}`,
      label: field.name,
      group: field.system ? 'Champs système' : 'Champs',
      detail: fieldKinds[field.kind],
      kind: 'field',
      fieldId: field.id,
    })),
    ...paths.map((path): ColumnChoice => ({
      key: `relation:${path.id}:${path.direction}`,
      label: path.name,
      group: 'Relations',
      detail:
        path.direction === 'incoming' ? 'Relation inverse' : 'Relation directe',
      kind: 'relation',
      relationId: path.id,
      direction: path.direction,
    })),
    {
      key: 'display',
      label: `Représentation de ${type.name}`,
      group: 'Présentation',
      detail: 'Titre, sous-titre et image',
      kind: 'display',
    },
  ]
  return { type, catalog, fields, paths, choices }
}

export function searchChoices(choices: ColumnChoice[], search: string) {
  const needle = normalize(search.trim())
  return choices.filter((choice) =>
    normalize(`${choice.label} ${choice.group} ${choice.detail}`).includes(
      needle,
    ),
  )
}

export const choiceFor = (context: ColumnContext, column: ViewColumn) =>
  context.choices.find((choice) => choice.key === viewColumnKey(column))

export const pathFor = (context: ColumnContext, column: ViewColumn) =>
  context.paths.find(
    (entry) =>
      entry.id === column.relation_id && entry.direction === column.direction,
  )

/** The single type whose display profiles apply to the column, if any. */
export function profileTargetFor(
  context: ColumnContext,
  column: ViewColumn,
): ConfiguredEntityType | undefined {
  if (column.kind === 'display') return context.type
  const path = pathFor(context, column)
  return path?.type_ids.length === 1
    ? context.catalog.find((entry) => entry.id === path.type_ids[0])
    : undefined
}

/** The explicitly chosen profile, or the default one when none is chosen. */
export function selectedProfile(
  target: ConfiguredEntityType | undefined,
  column: ViewColumn,
): DisplayProfile | undefined {
  return target?.configuration.display_profiles.find((profile) =>
    column.profile_id ? profile.id === column.profile_id : profile.is_default,
  )
}

export function columnDisplayLabel(
  context: ColumnContext,
  column: ViewColumn,
): string {
  if (column.kind === 'field') {
    const field = context.fields.find((entry) => entry.id === column.field_id)
    return field ? fieldKinds[field.kind] : '—'
  }
  if (column.kind === 'count') return 'Nombre d’éléments liés'
  return (
    selectedProfile(profileTargetFor(context, column), column)?.name ??
    'Profil par défaut'
  )
}

export const columnFromChoice = (choice: ColumnChoice): ViewColumn => ({
  id: crypto.randomUUID(),
  label: choice.label,
  kind: choice.kind,
  field_id: choice.fieldId ?? null,
  relation_id: choice.relationId ?? null,
  profile_id: null,
  direction: choice.direction ?? 'outgoing',
  collection_display: 'list',
})
