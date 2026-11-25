import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ViewColumn } from '../configuration'
import { choiceFor, columnDisplayLabel } from '../view-column-choices'
import type { ColumnContext } from '../view-column-choices'
import { useColumnDrag } from './use-column-drag'

export function ViewColumnsTable({
  context,
  columns,
  onReorder,
  onMove,
  onUpdate,
  onEdit,
  onRemove,
}: {
  context: ColumnContext
  columns: ViewColumn[]
  onReorder: (sourceId: string, targetId: string) => void
  onMove: (column: ViewColumn, offset: number) => void
  onUpdate: (index: number, patch: Partial<ViewColumn>) => void
  onEdit: (columnId: string) => void
  onRemove: (columnId: string) => void
}) {
  const { region, draggedId, overId, handleProps } = useColumnDrag(onReorder)
  const draggedIndex = columns.findIndex((entry) => entry.id === draggedId)

  const rowClass = (column: ViewColumn, index: number) => {
    if (overId === column.id && draggedId !== column.id)
      return draggedIndex < index
        ? 'bg-accent shadow-[inset_0_-2px_0_var(--primary)]'
        : 'bg-accent shadow-[inset_0_2px_0_var(--primary)]'
    return draggedId === column.id ? 'opacity-50' : ''
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <Table
        aria-label="Colonnes de la vue"
        className="min-w-[680px]"
        containerProps={{
          ref: region,
          className:
            'max-h-[min(55dvh,34rem)] overflow-auto overscroll-contain',
          role: 'region',
          'aria-label': 'Ordre des colonnes de la vue',
          tabIndex: 0,
        }}
      >
        <TableHeader className="sticky top-0 z-20 bg-muted">
          <TableRow>
            <TableHead scope="col" className="w-16">
              Ordre
            </TableHead>
            <TableHead scope="col">Colonne</TableHead>
            <TableHead scope="col">Libellé</TableHead>
            <TableHead scope="col">Affichage</TableHead>
            <TableHead
              scope="col"
              className="sticky right-0 bg-muted text-right"
            >
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((column, index) => {
            const choice = choiceFor(context, column)
            const display = columnDisplayLabel(context, column)
            return (
              <TableRow
                key={column.id}
                data-column-id={column.id}
                className={rowClass(column, index)}
              >
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex size-8 shrink-0 touch-none select-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring cursor-grab active:cursor-grabbing"
                      aria-label={`Déplacer ${column.label}`}
                      title="Glisser pour déplacer · Alt + flèche haut/bas"
                      {...handleProps(column.id)}
                      onKeyDown={(event) => {
                        if (
                          event.altKey &&
                          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
                        ) {
                          event.preventDefault()
                          onMove(column, event.key === 'ArrowUp' ? -1 : 1)
                        }
                      }}
                    >
                      <GripVertical className="pointer-events-none size-4" />
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <p
                    className="max-w-60 truncate text-sm font-medium"
                    title={choice?.label}
                  >
                    {choice?.label ?? 'Colonne indisponible'}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {choice?.group}
                  </span>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Libellé de ${choice?.label ?? column.label}`}
                    value={column.label}
                    maxLength={255}
                    className="h-8 min-w-40 max-w-72"
                    onChange={(event) =>
                      onUpdate(index, { label: event.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="max-w-48 truncate font-normal"
                    title={display}
                  >
                    {display}
                  </Badge>
                </TableCell>
                <TableCell className="sticky right-0 bg-card text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      aria-label={`Monter ${column.label}`}
                      onClick={() => onMove(column, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === columns.length - 1}
                      aria-label={`Descendre ${column.label}`}
                      onClick={() => onMove(column, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    {column.kind !== 'field' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Modifier l’affichage de ${column.label}`}
                        title="Configurer l’affichage"
                        onClick={() => onEdit(column.id)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Retirer ${column.label}`}
                      onClick={() => onRemove(column.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {!columns.length && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-40 text-center text-muted-foreground"
              >
                <p className="font-medium text-foreground">
                  Choisissez les colonnes de votre tableau
                </p>
                <p className="mt-1 text-xs">
                  Ajoutez vos champs et vos relations, puis placez-les dans
                  l’ordre souhaité.
                </p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
