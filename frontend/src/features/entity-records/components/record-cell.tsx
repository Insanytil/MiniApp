import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'
import {
  recordInitials,
  safeImageUrl,
} from '@/features/entity-types/presentation'
import { formatValue } from '../records'
import type { PresentedRecord, RecordCell as Cell } from '../records'

export { formatValue } from '../records'

export function RecordCell({ cell }: { cell?: Cell }) {
  if (!cell) return <span className="text-muted-foreground">—</span>
  if (cell.kind === 'count') return <span>{cell.total}</span>
  if (cell.kind === 'image') return <RecordImage url={cell.image} />
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
export function RecordImage({
  url,
  initials = '',
  variant = 'table',
}: {
  url: string | null
  initials?: string
  variant?: 'table' | 'detail' | 'avatar'
}) {
  const safe = safeImageUrl(url)
  const [failed, setFailed] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const available = !!safe && safe !== failed
  const frame =
    variant === 'detail'
      ? 'flex h-64 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 sm:h-80'
      : variant === 'avatar'
        ? 'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium'
        : 'flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-xs'
  if (!available) return <span className={frame}>{initials || '—'}</span>
  return (
    <>
      <button
        type="button"
        className={`${frame} cursor-zoom-in transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2`}
        aria-label="Agrandir l’image"
        onClick={() => setExpanded(true)}
      >
        <img
          src={safe}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className={`size-full ${variant === 'avatar' ? 'object-cover' : 'object-contain p-1'}`}
          onError={() => setFailed(safe)}
        />
      </button>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu de l’image</DialogTitle>
          </DialogHeader>
          <img
            src={safe}
            alt="Image de l’enregistrement"
            referrerPolicy="no-referrer"
            className="max-h-[75dvh] w-full rounded-lg object-contain"
            onError={() => setFailed(safe)}
          />
        </DialogContent>
      </Dialog>
    </>
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
