import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { ApiError, errorMessage } from '@/lib/api/client'
import { entityTypeKeys } from './entity-types'
import type { EntityType } from './entity-types'

export const fieldKinds = {
  text: 'Texte',
  email: 'Email',
  integer: 'Nombre entier',
  decimal: 'Nombre décimal',
  boolean: 'Oui / Non',
  date: 'Date',
  datetime: 'Date et heure',
  image: 'Image',
} as const
export type FieldKind = keyof typeof fieldKinds
export interface FieldDefinition {
  id: string
  name: string
  technical_name: string
  kind: FieldKind
  required: boolean
  system?: boolean
}
export interface RelationDefinition {
  id: string
  name: string
  technical_name: string
  target_type_ids: string[]
  inverse_name: string
  source_max: 1 | null
  target_max: 1 | null
  required: boolean
  on_delete: 'restrict' | 'unlink'
}
export interface DisplayProfile {
  id: string
  name: string
  title_fields: string[]
  secondary_fields: string[]
  image_field: string | null
  separator: string
  is_default: boolean
}
export interface ViewColumn {
  id: string
  label: string
  kind: 'field' | 'display' | 'relation' | 'count'
  field_id: string | null
  relation_id: string | null
  direction: 'outgoing' | 'incoming'
  profile_id: string | null
  collection_display: 'list' | 'first'
}
export interface ViewDefinition {
  id: string
  name: string
  columns: ViewColumn[]
  is_default: boolean
}
export interface EntityConfiguration {
  schema_version: 1
  fields: FieldDefinition[]
  relations: RelationDefinition[]
  display_profiles: DisplayProfile[]
  views: ViewDefinition[]
}
export interface ConfiguredEntityType extends EntityType {
  configuration_version: number
  configuration: EntityConfiguration
  available_system_fields: FieldDefinition[]
}
export type DefinitionKind =
  'fields' | 'relations' | 'display_profiles' | 'views'
export type DefinitionItem =
  FieldDefinition | RelationDefinition | DisplayProfile | ViewDefinition
export const configurationCatalogQuery = (organizationId: string) =>
  queryOptions({
    queryKey: [...entityTypeKeys(organizationId), 'configuration', 'catalog'],
    queryFn: ({ signal }) =>
      api.request<ConfiguredEntityType[]>(
        '/organization/entity-types/configuration/catalog',
        { signal, organizationScoped: true, organizationId },
      ),
  })
export function saveConfiguration(
  organizationId: string,
  typeId: string,
  expectedVersion: number,
  configuration: EntityConfiguration,
) {
  return api.request<ConfiguredEntityType>(
    `/organization/entity-types/${encodeURIComponent(typeId)}/configuration`,
    {
      method: 'PUT',
      organizationScoped: true,
      organizationId,
      body: { expected_version: expectedVersion, configuration },
    },
  )
}
export function configurationError(error: unknown) {
  if (error instanceof ApiError) {
    if (
      error.status === 409 &&
      error.detail === 'Configuration version conflict'
    )
      return 'La configuration a été modifiée ailleurs. Rechargez la version enregistrée avant de réessayer.'
    if (error.status === 422 && error.issues.length)
      return error.issues
        .slice(0, 5)
        .map((issue) => `${issue.field ?? 'Configuration'} : ${issue.message}`)
        .join(' · ')
    if (error.detail && [409, 422].includes(error.status)) return error.detail
  }
  return errorMessage(error)
}
export function fieldsOf(type: ConfiguredEntityType) {
  return [...type.available_system_fields, ...type.configuration.fields]
}
export interface Navigation {
  id: string
  name: string
  direction: 'outgoing' | 'incoming'
  type_ids: string[]
  many: boolean
}
export function navigations(
  typeId: string,
  catalog: ConfiguredEntityType[],
): Navigation[] {
  return catalog.flatMap((type) =>
    type.configuration.relations.flatMap((relation) => {
      const paths: Navigation[] = []
      if (type.id === typeId)
        paths.push({
          id: relation.id,
          name: relation.name,
          direction: 'outgoing',
          type_ids: relation.target_type_ids,
          many: relation.source_max === null,
        })
      if (relation.target_type_ids.includes(typeId))
        paths.push({
          id: relation.id,
          name: relation.inverse_name,
          direction: 'incoming',
          type_ids: [type.id],
          many: relation.target_max === null,
        })
      return paths
    }),
  )
}
export function relationCount(typeId: string, catalog: ConfiguredEntityType[]) {
  return new Set(navigations(typeId, catalog).map((path) => path.id)).size
}
export function dependentDefinitions(
  id: string,
  catalog: ConfiguredEntityType[],
) {
  const references = [
    'title_fields',
    'secondary_fields',
    'image_field',
    'field_id',
    'relation_id',
    'profile_id',
  ]
  return catalog.flatMap((type) =>
    (['display_profiles', 'views'] as const).flatMap((kind) =>
      type.configuration[kind]
        .filter((item) => {
          if (item.id === id) return false
          const check = (value: unknown): boolean => {
            if (!value || typeof value !== 'object') return false
            if (Array.isArray(value)) return value.some(check)
            return Object.entries(value).some(([key, child]) =>
              references.includes(key)
                ? child === id || (Array.isArray(child) && child.includes(id))
                : check(child),
            )
          }
          return check(item)
        })
        .map((item) => `${type.name} / ${item.name}`),
    ),
  )
}
const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/)
export function definitionError(
  kind: DefinitionKind,
  item: DefinitionItem,
): string | null {
  if (!item.name.trim() || item.name.length > 255)
    return 'Le nom doit contenir entre 1 et 255 caractères.'
  if (kind === 'fields' || kind === 'relations') {
    const named = item as FieldDefinition | RelationDefinition
    if (!identifier.safeParse(named.technical_name).success)
      return 'Identifiant invalide : lettres minuscules, chiffres et underscores simples ; commencez par une lettre.'
    if (
      ['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(
        named.technical_name,
      )
    )
      return 'Cet identifiant est réservé à un champ système.'
  }
  if (kind === 'relations') {
    const relation = item as RelationDefinition
    if (!relation.target_type_ids.length || !relation.inverse_name.trim())
      return 'Choisissez l’entité liée et nommez la relation inverse.'
    if (relation.required && relation.on_delete === 'unlink')
      return 'Une relation obligatoire doit empêcher la suppression de l’enregistrement lié.'
  }
  if (
    kind === 'display_profiles' &&
    !(item as DisplayProfile).title_fields.length
  )
    return 'Sélectionnez au moins un champ pour le titre.'
  if (
    kind === 'views' &&
    (!(item as ViewDefinition).columns.length ||
      (item as ViewDefinition).columns.some(
        (c) =>
          !c.label.trim() ||
          (c.kind === 'field'
            ? !c.field_id
            : c.kind === 'display'
              ? false
              : !c.relation_id),
      ))
  )
    return 'Chaque vue doit avoir au moins une colonne avec un libellé et un contenu valide.'
  if (kind === 'views') {
    const keys = (item as ViewDefinition).columns.map((column) =>
      column.kind === 'field'
        ? `field:${column.field_id}`
        : column.kind === 'display'
          ? 'display'
          : `relation:${column.relation_id}:${column.direction}`,
    )
    if (new Set(keys).size !== keys.length)
      return 'Une colonne ne peut apparaître qu’une seule fois dans une vue.'
  }
  return null
}

/** Replace one reusable profile without changing fields, relations or views. */
export function withDisplayProfile(
  configuration: EntityConfiguration,
  profile: DisplayProfile,
): EntityConfiguration {
  const profiles = configuration.display_profiles
  const next = profiles.some((item) => item.id === profile.id)
    ? profiles.map((item) => (item.id === profile.id ? profile : item))
    : [...profiles, profile]
  const defaultId = profile.is_default
    ? profile.id
    : (next.find((item) => item.is_default)?.id ?? next[0]?.id)
  return {
    ...configuration,
    display_profiles: next.map((item) => ({
      ...item,
      is_default: item.id === defaultId,
    })),
  }
}
