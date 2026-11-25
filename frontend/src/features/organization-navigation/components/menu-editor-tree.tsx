import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MenuNode, MenuResponse } from '../navigation'
import { MenuIcon } from './menu-icon'

export function MenuEditorTree({
  nodes,
  types,
  disabled,
  onEdit,
  onDelete,
  onMove,
}: {
  nodes: MenuNode[]
  types: MenuResponse['entity_types']
  disabled: boolean
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
  onMove: (id: string, offset: number) => void
}) {
  return (
    <ul className="space-y-2">
      {nodes.map((node, index) => {
        const label =
          node.label ||
          (node.kind === 'entity'
            ? types.find((type) => type.id === node.entity_type_id)?.name
            : '') ||
          'Type indisponible'
        return (
          <li key={node.id}>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <MenuIcon icon={node.icon} kind={node.kind} />
                <span className="truncate" title={label}>
                  {label}
                </span>
              </span>
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === 0}
                  aria-label={`Monter ${label}`}
                  onClick={() => onMove(node.id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === nodes.length - 1}
                  aria-label={`Descendre ${label}`}
                  onClick={() => onMove(node.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Modifier ${label}`}
                  onClick={() => onEdit(node)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Retirer ${label}`}
                  onClick={() => onDelete(node)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {node.kind === 'category' && (
              <div className="mt-2 ml-2 border-l pl-2 sm:ml-4 sm:pl-3">
                <MenuEditorTree
                  nodes={node.children}
                  types={types}
                  disabled={disabled}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                />
                {!node.children.length && (
                  <p className="py-2 text-xs text-muted-foreground">
                    Catégorie vide
                  </p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
