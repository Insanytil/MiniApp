import type {
  ConfiguredEntityType,
  DefinitionItem,
  DefinitionKind,
  FieldDefinition,
  FieldKind,
  RelationDefinition,
  ViewColumn,
} from './configuration'

/** Union of every editable property across all definition kinds. */
export interface DefinitionDraft {
  name: string
  technical_name: string
  kind: FieldKind
  required: boolean
  options: NonNullable<FieldDefinition['options']>
  multiple: boolean
  target_type_ids: string[]
  inverse_name: string
  source_max: 1 | null
  target_max: 1 | null
  on_delete: 'restrict' | 'unlink'
  title_fields: string[]
  secondary_fields: string[]
  image_field: string | null
  separator: string
  is_default: boolean
  columns: ViewColumn[]
}

export type DraftUpdate = (patch: Partial<DefinitionDraft>) => void

export const definitionKindLabels: Record<DefinitionKind, string> = {
  fields: 'champ',
  relations: 'relation',
  display_profiles: 'affichage',
  views: 'vue',
}

export const existingRelationOf = (
  kind: DefinitionKind,
  item?: DefinitionItem,
): RelationDefinition | undefined =>
  kind === 'relations' && item && 'target_type_ids' in item ? item : undefined

export function initialDraft(
  kind: DefinitionKind,
  type: ConfiguredEntityType,
  item?: DefinitionItem,
): DefinitionDraft {
  return {
    name: '',
    technical_name: '',
    kind: 'text',
    required: false,
    options: [],
    multiple: false,
    target_type_ids: [],
    inverse_name: '',
    source_max: 1,
    target_max: null,
    on_delete: 'restrict',
    title_fields: [],
    secondary_fields: [],
    image_field: null,
    separator: ' ',
    is_default: type.configuration[kind].length === 0,
    columns: [],
    ...item,
  }
}

/** Keep only the properties that belong to `kind`, trimmed for saving. */
export function definitionFromDraft(
  kind: DefinitionKind,
  draft: DefinitionDraft,
  id: string,
  existingRelation?: RelationDefinition,
): DefinitionItem {
  const name = draft.name.trim()
  if (kind === 'fields')
    return {
      id,
      name,
      technical_name: draft.technical_name,
      kind: draft.kind,
      required: draft.required,
      ...(draft.kind === 'choice'
        ? {
            options: draft.options.map((option) => ({
              ...option,
              name: option.name.trim(),
            })),
            multiple: draft.multiple,
          }
        : {}),
    }
  if (kind === 'relations')
    return {
      id,
      name,
      technical_name: draft.technical_name,
      target_type_ids:
        existingRelation?.target_type_ids ?? draft.target_type_ids,
      inverse_name: draft.inverse_name.trim(),
      source_max: draft.source_max,
      target_max: draft.target_max,
      required: draft.required,
      on_delete: draft.on_delete,
    }
  if (kind === 'display_profiles')
    return {
      id,
      name,
      title_fields: draft.title_fields,
      secondary_fields: draft.secondary_fields,
      image_field: draft.image_field,
      separator: draft.separator,
      is_default: draft.is_default,
    }
  return { id, name, columns: draft.columns, is_default: draft.is_default }
}

/** Fields and relations share one technical-name namespace per type. */
export function technicalNameTaken(
  type: ConfiguredEntityType,
  definition: FieldDefinition | RelationDefinition,
): boolean {
  return [...type.configuration.fields, ...type.configuration.relations].some(
    (existing) =>
      existing.id !== definition.id &&
      existing.technical_name === definition.technical_name,
  )
}
