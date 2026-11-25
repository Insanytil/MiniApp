import type { ConfiguredEntityType, FieldDefinition } from './configuration'
import { matchesSearch } from '@/lib/search'

export interface FieldFilters {
  search: string
  kind: string
  required: '' | 'required' | 'optional'
}

export const emptyFieldFilters: FieldFilters = {
  search: '',
  kind: '',
  required: '',
}

export const hasFieldFilters = (filters: FieldFilters) =>
  !!filters.search.trim() || !!filters.kind || !!filters.required

/** Custom fields first, then the type's system fields, each flagged. */
export const listedFields = (type: ConfiguredEntityType) => [
  ...type.configuration.fields.map((field) => ({ ...field, system: false })),
  ...type.available_system_fields.map((field) => ({ ...field, system: true })),
]

export function filterFields<T extends FieldDefinition>(
  fields: T[],
  filters: FieldFilters,
): T[] {
  return fields.filter(
    (field) =>
      matchesSearch(`${field.name} ${field.technical_name}`, filters.search) &&
      (!filters.kind || field.kind === filters.kind) &&
      (!filters.required ||
        field.required === (filters.required === 'required')),
  )
}

/** Move a field to `targetIndex`; returns null when the move is a no-op. */
export function moveField(
  fields: FieldDefinition[],
  sourceId: string,
  targetIndex: number,
): FieldDefinition[] | null {
  const index = fields.findIndex((field) => field.id === sourceId)
  if (
    index < 0 ||
    index === targetIndex ||
    targetIndex < 0 ||
    targetIndex >= fields.length
  )
    return null
  const next = [...fields]
  const [field] = next.splice(index, 1)
  next.splice(targetIndex, 0, field)
  return next
}
