import { RecordImage } from '@/features/files/record-image'
import { ChoiceBadges } from '@/features/entity-types/components/choice-badges'
import { recordInitials } from '@/features/entity-types/presentation'
import { formatValue } from '../records'
import type { PresentedRecord, RecordCell as Cell } from '../records'

export { formatValue } from '../records'

export function RecordCell({ cell }: { cell?: Cell }) {
  if (!cell) return <span className="text-muted-foreground">—</span>
  if (cell.kind === 'count') return <span>{cell.total}</span>
  if (cell.kind === 'image') return <RecordImage url={cell.image} />
  if (cell.choice_options) return <ChoiceBadges options={cell.choice_options} />
  if (cell.kind === 'records')
    return (
      <div className="space-y-2">
        {cell.items.map((item) => (
          <RecordSummary key={item.id} item={item} />
        ))}
        {cell.total > cell.items.length && (
          <span className="text-xs text-muted-foreground">
            +{cell.total - cell.items.length}
          </span>
        )}
        {!cell.total && <span className="text-muted-foreground">—</span>}
      </div>
    )
  return (
    <span
      className={`inline-block max-w-xs truncate align-middle ${cell.field_kind === 'decimal' || cell.field_kind === 'integer' ? 'w-full text-right tabular-nums' : ''}`}
      title={cell.text ?? undefined}
    >
      {formatValue(cell.text, cell.field_kind)}
    </span>
  )
}
function RecordSummary({ item }: { item: PresentedRecord }) {
  const initials = recordInitials(item.title)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <RecordImage url={item.image} initials={initials} variant="avatar" />
      <div className="min-w-0">
        <p className="max-w-56 truncate font-medium" title={item.title}>
          {item.title}
        </p>
        {item.secondary && (
          <p
            className="max-w-56 truncate text-xs text-muted-foreground"
            title={item.secondary}
          >
            {item.secondary}
          </p>
        )}
      </div>
    </div>
  )
}
