import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

/** Drag handle with Alt+arrow shortcuts and an up/down fallback menu. */
export function FieldOrderHandle({
  name,
  index,
  count,
  disabled,
  busy,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  name: string
  index: number
  count: number
  disabled: boolean
  busy: boolean
  onMove: (targetIndex: number) => void
  onDragStart: (event: DragEvent) => void
  onDragEnd: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            draggable={!disabled}
            aria-label={`Déplacer ${name}`}
            title="Glisser pour déplacer, ou Alt + flèche haut/bas"
            onKeyDown={(e) => {
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                onMove(index + (e.key === 'ArrowUp' ? -1 : 1))
              }
            }}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
          />
        }
      >
        <GripVertical className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-48" align="start">
        <PopoverTitle>Déplacer le champ</PopoverTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={index === 0 || busy}
          onClick={() => onMove(index - 1)}
        >
          <ArrowUp /> Monter
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={index === count - 1 || busy}
          onClick={() => onMove(index + 1)}
        >
          <ArrowDown /> Descendre
        </Button>
      </PopoverContent>
    </Popover>
  )
}
