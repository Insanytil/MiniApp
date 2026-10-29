import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ApiError, errorMessage } from '@/lib/api/client'
import { organizationQueryKey } from '@/features/organizations/selection'
import { recordsKey } from './records'
import type { PresentedRecord } from './records'
import type { FieldDefinition } from '@/features/entity-types/configuration'
import type { AsyncOption } from '@/components/inputs/async-combobox'
import { safeImageUrl } from '@/features/entity-types/presentation'

export interface CreationRelation {
  id: string
  name: string
  direction: 'outgoing' | 'incoming'
  type_ids: string[]
  target_types: { id: string; name: string }[]
  many: boolean
  required: boolean
}
export interface CreationSchema {
  id: string
  name: string
  configuration_version: number
  fields: FieldDefinition[]
  relations: CreationRelation[]
  record_id?: string
  updated_at?: string
  values?: Record<string, unknown>
  selections?: Record<string, AsyncOption[]>
}
export interface CreationDraft {
  values: Record<string, string>
  relations: Record<string, AsyncOption[]>
}
export interface CreateRecordPayload {
  expected_configuration_version: number
  expected_updated_at?: string
  values: Record<string, string | number | boolean>
  relations: {
    relation_id: string
    direction: 'outgoing' | 'incoming'
    record_ids: string[]
  }[]
}
export const relationKey = (
  relation: Pick<CreationRelation, 'id' | 'direction'>,
) => `relation:${relation.id}:${relation.direction}`
export const recordRootKey = (organizationId: string) =>
  organizationQueryKey(organizationId, 'entity-records')
export const creationSchemaQuery = (
  organizationId: string,
  typeId: string,
  recordId?: string,
) =>
  queryOptions({
    queryKey: [
      ...recordsKey(organizationId, typeId),
      'creation-schema',
      recordId ?? null,
    ],
    queryFn: ({ signal }) =>
      api.request<CreationSchema>(
        `/organization/entities/${encodeURIComponent(typeId)}/${recordId ? `records/${encodeURIComponent(recordId)}/edit-schema` : 'creation-schema'}`,
        { signal, organizationId, organizationScoped: true },
      ),
    refetchOnWindowFocus: false,
  })
export function createRecord(
  organizationId: string,
  typeId: string,
  payload: CreateRecordPayload,
) {
  return api.request<{ id: string; entity_type_id: string }>(
    `/organization/entities/${encodeURIComponent(typeId)}/records`,
    { method: 'POST', organizationId, organizationScoped: true, body: payload },
  )
}
export function updateRecord(
  organizationId: string,
  typeId: string,
  recordId: string,
  payload: CreateRecordPayload,
) {
  return api.request<{ id: string; entity_type_id: string }>(
    `/organization/entities/${encodeURIComponent(typeId)}/records/${encodeURIComponent(recordId)}`,
    { method: 'PUT', organizationId, organizationScoped: true, body: payload },
  )
}
function inputValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.kind === 'datetime' && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      return local.toISOString().slice(0, -1)
    }
  }
  return String(value)
}
export function initialDraft(schema: CreationSchema): CreationDraft {
  return {
    values: Object.fromEntries(
      schema.fields.map((field) => [
        field.id,
        inputValue(field, schema.values?.[field.id]),
      ]),
    ),
    relations: Object.fromEntries(
      schema.relations.map((relation) => [
        relationKey(relation),
        schema.selections?.[relationKey(relation)] ?? [],
      ]),
    ),
  }
}
export function buildRecordPayload(
  schema: CreationSchema,
  draft: CreationDraft,
) {
  const errors: Record<string, string> = {}
  const values: CreateRecordPayload['values'] = {}
  for (const field of schema.fields) {
    const raw = (draft.values[field.id] ?? '').trim()
    if (!raw) {
      if (field.required) errors[field.id] = 'Ce champ est obligatoire.'
      continue
    }
    if (field.kind === 'integer' || field.kind === 'decimal') {
      const number = Number(
        field.kind === 'decimal' ? raw.replace(',', '.') : raw,
      )
      if (
        !Number.isFinite(number) ||
        Math.abs(number) > Number.MAX_SAFE_INTEGER ||
        (field.kind === 'integer' &&
          (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(number)))
      )
        errors[field.id] = 'Nombre invalide ou trop grand.'
      else values[field.id] = number
    } else if (field.kind === 'boolean') {
      if (!['true', 'false'].includes(raw))
        errors[field.id] = 'Choisissez Oui ou Non.'
      else values[field.id] = raw === 'true'
    } else if (field.kind === 'datetime') {
      const date = new Date(raw)
      if (Number.isNaN(date.getTime()))
        errors[field.id] = 'Date et heure invalides.'
      else values[field.id] = date.toISOString()
    } else if (field.kind === 'date') {
      const date = new Date(raw)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== raw
      )
        errors[field.id] = 'Date invalide.'
      else values[field.id] = raw
    } else if (field.kind === 'image') {
      const url = safeImageUrl(raw)
      if (!url || url.length > 2048)
        errors[field.id] = 'Utilisez une URL HTTPS ou un chemin d’image valide.'
      else values[field.id] = url
    } else if (field.kind === 'email') {
      if (raw.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
        errors[field.id] = 'Adresse e-mail invalide.'
      else values[field.id] = raw
    } else {
      if (raw.length > 10000) errors[field.id] = '10 000 caractères maximum.'
      else values[field.id] = raw
    }
  }
  const relations: CreateRecordPayload['relations'] = []
  for (const relation of schema.relations) {
    const key = relationKey(relation)
    const selected = draft.relations[key] ?? []
    if (relation.required && !selected.length)
      errors[key] = 'Cette relation est obligatoire.'
    const limit = Math.max(100, schema.selections?.[key]?.length ?? 0)
    if ((!relation.many && selected.length > 1) || selected.length > limit)
      errors[key] = relation.many
        ? `${limit} éléments maximum.`
        : 'Sélectionnez un seul élément.'
    if (selected.length)
      relations.push({
        relation_id: relation.id,
        direction: relation.direction,
        record_ids: [...new Set(selected.map((option) => option.value))],
      })
  }
  return {
    payload: {
      expected_configuration_version: schema.configuration_version,
      ...(schema.updated_at ? { expected_updated_at: schema.updated_at } : {}),
      values,
      relations,
    },
    errors,
  }
}
export async function recordOptions(
  organizationId: string,
  typeId: string,
  relation: CreationRelation,
  search: string,
  signal: AbortSignal,
  recordId?: string,
) {
  const params = new URLSearchParams({
    relation_id: relation.id,
    direction: relation.direction,
    page: '1',
    page_size: '20',
  })
  if (search.trim()) params.set('search', search.trim())
  if (recordId) params.set('record_id', recordId)
  const result = await api.request<{
    items: PresentedRecord[]
    pagination: { total: number }
  }>(
    `/organization/entities/${encodeURIComponent(typeId)}/record-options?${params}`,
    { signal, organizationId, organizationScoped: true },
  )
  return {
    items: result.items.map((item) => ({
      value: item.id,
      label: item.title,
      description: [
        relation.target_types.find((type) => type.id === item.entity_type_id)
          ?.name,
        item.secondary,
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    hasMore: result.pagination.total > result.items.length,
  }
}
export function createRecordError(error: unknown) {
  if (error instanceof ApiError) {
    if (
      error.status === 409 &&
      error.detail === 'Record schema version conflict'
    )
      return 'La configuration de ce type a changé. Rechargez le formulaire avant de réessayer.'
    if (error.detail === 'Record version conflict')
      return 'Cet enregistrement a été modifié entre-temps. Rechargez le formulaire pour éviter d’écraser ces changements.'
    if (error.issues.length)
      return error.issues.map((issue) => issue.message).join(' · ')
    if (error.detail && [409, 422].includes(error.status)) return error.detail
  }
  return errorMessage(error)
}
