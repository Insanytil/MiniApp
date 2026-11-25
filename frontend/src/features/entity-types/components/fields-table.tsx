import { useState } from 'react'
import { LockKeyhole, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dependentDefinitions, fieldKinds } from '../configuration'
import type {
  ConfiguredEntityType,
  FieldDefinition,
  FieldKind,
} from '../configuration'
import {
  emptyFieldFilters,
  filterFields,
  hasFieldFilters,
  listedFields,
  moveField,
} from '../fields-order'
import { DependenciesPopover } from './dependencies-popover'
import { FieldOrderHandle } from './field-order-handle'
import { FieldsToolbar } from './fields-toolbar'

const symbols: Record<FieldKind, string> = {
  text: 'Aa',
  email: '@',
  integer: '123',
  decimal: '1.0',
  boolean: '0/1',
  date: 'Date',
  datetime: 'Date',
  image: 'Img',
  choice: 'Liste',
  phone: 'Tél.',
  address: 'Adr.',
}

export function FieldsTable({
  type,
  catalog,
  busy,
  onAdd,
  onEdit,
  onRemove,
  onReorder,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  busy: boolean
  onAdd: () => void
  onEdit: (field: FieldDefinition) => void
  onRemove: (field: FieldDefinition) => void
  onReorder: (fields: FieldDefinition[]) => void
}) {
  const [filters, setFilters] = useState(emptyFieldFilters)
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const fields = type.configuration.fields
  const allFields = listedFields(type)
  const filtered = hasFieldFilters(filters)
  const visible = filterFields(allFields, filters)
  const reorder = (sourceId: string, targetIndex: number) => {
    if (busy || filtered) return
    const next = moveField(fields, sourceId, targetIndex)
    if (!next) return
    onReorder(next)
    setAnnouncement(
      `${next[targetIndex].name} déplacé en position ${targetIndex + 1} sur ${fields.length}.`,
    )
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <FieldsToolbar
        filters={filters}
        onFiltersChange={setFilters}
        filtered={filtered}
        visibleCount={visible.length}
        totalCount={allFields.length}
        busy={busy}
        onAdd={onAdd}
      />
      {filtered && (
        <p className="shrink-0 text-xs text-muted-foreground">
          Réinitialisez les filtres pour réordonner les champs.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setFilters(emptyFieldFilters)}
          >
            Réinitialiser
          </button>
        </p>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <Table
          aria-label="Champs de l’entité"
          className="min-w-[640px]"
          containerProps={{
            className:
              'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain',
            tabIndex: 0,
            role: 'region',
            'aria-label': 'Tableau des champs de l’entité',
          }}
        >
          <TableHeader className="sticky top-0 z-20 bg-muted">
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Ordre</span>
              </TableHead>
              <TableHead scope="col" className="w-[40%]">
                Champ
              </TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Requis</TableHead>
              <TableHead scope="col">Utilisation</TableHead>
              <TableHead
                scope="col"
                className="sticky right-0 bg-muted text-right"
              >
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((field) => {
              const index = fields.findIndex((item) => item.id === field.id)
              const dependencies = dependentDefinitions(field.id, catalog)
              return (
                <TableRow
                  key={field.id}
                  data-field-id={field.id}
                  className={
                    over === field.id && dragged !== field.id
                      ? 'bg-accent shadow-[inset_0_2px_0_var(--primary)]'
                      : dragged === field.id
                        ? 'opacity-50'
                        : ''
                  }
                  onDragOver={(e) => {
                    if (!field.system && dragged && !busy && !filtered) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setOver(field.id)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (!field.system && dragged) reorder(dragged, index)
                    setDragged(null)
                    setOver(null)
                  }}
                >
                  <TableCell className="px-2">
                    {field.system ? (
                      <LockKeyhole
                        className="mx-auto size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <FieldOrderHandle
                        name={field.name}
                        index={index}
                        count={fields.length}
                        disabled={busy || filtered}
                        busy={busy}
                        onMove={(target) => reorder(field.id, target)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', field.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDragged(field.id)
                        }}
                        onDragEnd={() => {
                          setDragged(null)
                          setOver(null)
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <p
                        className="max-w-72 truncate font-medium"
                        title={field.name}
                      >
                        {field.name}
                      </p>
                      {field.system && (
                        <Popover>
                          <PopoverTrigger
                            render={
                              <button
                                type="button"
                                className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                                aria-label={`Informations sur le champ système ${field.name}`}
                              />
                            }
                          >
                            <Badge
                              variant="outline"
                              className="cursor-help text-[10px] font-normal"
                            >
                              Système
                            </Badge>
                          </PopoverTrigger>
                          <PopoverContent align="start">
                            <PopoverTitle>
                              Champ système · {field.name}
                            </PopoverTitle>
                            <p className="text-xs text-muted-foreground">
                              Champ géré automatiquement par l’application. Il
                              ne peut être ni modifié, ni supprimé, ni déplacé.
                            </p>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {field.technical_name}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1.5 font-normal">
                      <span className="font-mono text-[10px]">
                        {symbols[field.kind]}
                      </span>
                      {fieldKinds[field.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {field.system ? (
                      <span className="text-xs text-muted-foreground">
                        Automatique
                      </span>
                    ) : field.required ? (
                      <Badge>Requis</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Optionnel
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DependenciesPopover
                      dependencies={dependencies}
                      name={field.name}
                      title={`Utilisation de ${field.name}`}
                      emptyLabel="Non utilisé"
                    />
                  </TableCell>
                  <TableCell className="sticky right-0 bg-card text-right">
                    {field.system ? (
                      <span
                        className="text-muted-foreground"
                        aria-label="Aucune action disponible"
                      >
                        —
                      </span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Modifier ${field.name}`}
                          onClick={() => onEdit(field)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy || dependencies.length > 0}
                          aria-label={`Supprimer ${field.name}`}
                          title={
                            dependencies.length
                              ? 'Retirez les utilisations avant de supprimer ce champ.'
                              : 'Supprimer le champ'
                          }
                          className="text-destructive hover:text-destructive"
                          onClick={() => onRemove(field)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {!visible.length && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  {allFields.length
                    ? 'Aucun champ ne correspond aux filtres.'
                    : 'Aucun champ personnalisé. Ajoutez votre premier champ.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
