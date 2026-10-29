import type { ViewColumn } from './configuration'

/** A relation and its counter are two presentations of the same column. */
export function viewColumnKey(column: ViewColumn): string {
  if (column.kind === 'field') return `field:${column.field_id}`
  if (column.kind === 'display') return 'display'
  return `relation:${column.relation_id}:${column.direction}`
}

/** Move a column by its stable identity without changing its configuration. */
export function moveViewColumn(
  columns: ViewColumn[],
  sourceId: string,
  targetId: string,
): ViewColumn[] {
  const source = columns.findIndex((column) => column.id === sourceId)
  const target = columns.findIndex((column) => column.id === targetId)
  if (source < 0 || target < 0 || source === target) return columns
  const next = [...columns]
  const [column] = next.splice(source, 1)
  next.splice(target, 0, column)
  return next
}
