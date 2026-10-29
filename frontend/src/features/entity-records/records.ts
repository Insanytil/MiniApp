import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { organizationQueryKey } from '@/features/organizations/selection'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'

export interface PresentedRecord {
  id: string
  entity_type_id: string
  title: string
  secondary: string
  image: string | null
}
export interface RecordCell {
  kind: 'text' | 'image' | 'records' | 'count'
  text: string | null
  image: string | null
  field_kind: string | null
  items: PresentedRecord[]
  total: number
}
export interface EntityRecordRow {
  id: string
  cells: Record<string, RecordCell>
}
export interface RecordTable extends PageResponse<EntityRecordRow> {
  entity_type: { id: string; name: string; technical_name: string }
  view: {
    id: string | null
    name: string
    columns: { id: string; label: string }[]
  }
}
export interface RecordDetail {
  id: string
  entity_type_name: string
  fields: {
    id: string
    name: string
    technical_name: string
    kind: string
    system?: boolean
    value: unknown
  }[]
}
export const recordsKey = (organizationId: string, typeId: string) =>
  organizationQueryKey(organizationId, 'entity-records', typeId)
export const recordsQuery = (
  organizationId: string,
  typeId: string,
  params: ListParams,
) =>
  queryOptions({
    queryKey: [...recordsKey(organizationId, typeId), 'list', params],
    queryFn: ({ signal }) =>
      api.request<RecordTable>(
        `/organization/entities/${encodeURIComponent(typeId)}/records?${listSearchParams(params)}`,
        { signal, organizationId, organizationScoped: true },
      ),
  })
export const recordDetailQuery = (
  organizationId: string,
  typeId: string,
  recordId: string,
) =>
  queryOptions({
    queryKey: [...recordsKey(organizationId, typeId), 'detail', recordId],
    queryFn: ({ signal }) =>
      api.request<RecordDetail>(
        `/organization/entities/${encodeURIComponent(typeId)}/records/${encodeURIComponent(recordId)}`,
        { signal, organizationId, organizationScoped: true },
      ),
  })

export function formatValue(value: unknown, kind?: string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  if (kind === 'boolean' && (value === 'true' || value === 'false'))
    return value === 'true' ? 'Oui' : 'Non'
  if (
    (kind === 'decimal' || kind === 'integer') &&
    /^-?\d+(\.\d+)?$/.test(String(value))
  ) {
    const [whole, ...fraction] = String(value).split('.')
    // Keep decimal precision: converting monetary strings to Number would round them.
    const grouped = new Intl.NumberFormat('fr-BE').format(BigInt(whole))
    const sign = whole.startsWith('-') && BigInt(whole) === 0n ? '-' : ''
    return sign + grouped + (fraction.length ? `,${fraction[0]}` : '')
  }
  if ((kind === 'date' || kind === 'datetime') && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat('fr-BE', {
        dateStyle: 'medium',
        ...(kind === 'datetime'
          ? { timeStyle: 'short' as const }
          : { timeZone: 'UTC' }),
      }).format(date)
  }
  return typeof value === 'object' ? 'Valeur non disponible' : String(value)
}
