import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fieldKinds, navigations } from '../configuration'
import type {
  ConfiguredEntityType,
  DisplayProfile,
  ViewColumn,
} from '../configuration'
import { moveViewColumn, viewColumnKey } from '../view-column-order'
import { ConfigurationPreview } from './configuration-preview'
import { DefinitionSheet } from './definition-sheet'

interface ColumnChoice {
  key: string
  label: string
  group: string
  detail: string
  kind: 'field' | 'relation' | 'display'
  fieldId?: string
  relationId?: string
  direction?: 'outgoing' | 'incoming'
}
interface PointerDrag {
  columnId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

export function ViewColumnsEditor({
  type,
  catalog,
  columns,
  onChange,
  onSaveRelatedProfile,
  onBusyChange,
  onDirtyChange,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  columns: ViewColumn[]
  onChange: (columns: ViewColumn[]) => void
  onSaveRelatedProfile?: (
    target: ConfiguredEntityType,
    profile: DisplayProfile,
  ) => Promise<void>
  onBusyChange: (busy: boolean) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const id = useId()
  const fields = [...type.configuration.fields, ...type.available_system_fields]
  const paths = navigations(type.id, catalog)
  const region = useRef<HTMLDivElement>(null)
  const drag = useRef<PointerDrag | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [profileEditor, setProfileEditor] = useState<{
    target: ConfiguredEntityType
    columnId: string
    profile?: DisplayProfile
  } | null>(null)
  const editing = columns.find((column) => column.id === editingId)
  const keys = new Set(columns.map(viewColumnKey))
  const duplicates = keys.size !== columns.length
  const remaining = Math.max(0, 50 - columns.length)
  const choices: ColumnChoice[] = [
    ...fields.map((field): ColumnChoice => ({
      key: `field:${field.id}`,
      label: field.name,
      group: field.system ? 'Champs système' : 'Champs',
      detail: fieldKinds[field.kind],
      kind: 'field',
      fieldId: field.id,
    })),
    ...paths.map((path): ColumnChoice => ({
      key: `relation:${path.id}:${path.direction}`,
      label: path.name,
      group: 'Relations',
      detail:
        path.direction === 'incoming' ? 'Relation inverse' : 'Relation directe',
      kind: 'relation',
      relationId: path.id,
      direction: path.direction,
    })),
    {
      key: 'display',
      label: `Représentation de ${type.name}`,
      group: 'Présentation',
      detail: 'Titre, sous-titre et image',
      kind: 'display',
    },
  ]
  const visibleChoices = choices.filter((choice) =>
    normalize(`${choice.label} ${choice.group} ${choice.detail}`).includes(
      normalize(addSearch.trim()),
    ),
  )
  const availableChoices = visibleChoices.filter(
    (choice) => !keys.has(choice.key),
  )
  const choiceFor = (column: ViewColumn) =>
    choices.find((choice) => choice.key === viewColumnKey(column))
  const update = (index: number, patch: Partial<ViewColumn>) =>
    onChange(
      columns.map((column, i) =>
        i === index ? { ...column, ...patch } : column,
      ),
    )
  const displayLabel = (column: ViewColumn) => {
    if (column.kind === 'field') {
      const field = fields.find((entry) => entry.id === column.field_id)
      return field ? fieldKinds[field.kind] : '—'
    }
    if (column.kind === 'count') return 'Nombre d’éléments liés'
    const path = paths.find(
      (entry) =>
        entry.id === column.relation_id && entry.direction === column.direction,
    )
    const target =
      column.kind === 'display'
        ? type
        : path?.type_ids.length === 1
          ? catalog.find((entry) => entry.id === path.type_ids[0])
          : undefined
    return (
      target?.configuration.display_profiles.find((profile) =>
        column.profile_id
          ? profile.id === column.profile_id
          : profile.is_default,
      )?.name ?? 'Profil par défaut'
    )
  }
  const reorder = (sourceId: string, targetId: string) => {
    const next = moveViewColumn(columns, sourceId, targetId)
    if (next === columns) return
    onChange(next)
    setAnnouncement(
      `Colonne déplacée en position ${next.findIndex((column) => column.id === sourceId) + 1} sur ${next.length}.`,
    )
  }
  const move = (column: ViewColumn, offset: number) => {
    const index = columns.indexOf(column) + offset
    const target = index >= 0 ? columns.at(index) : undefined
    if (target) reorder(column.id, target.id)
  }
  const targetAt = (x: number, y: number): string | null => {
    const element = region.current
    if (!element) return null
    const frame = element.getBoundingClientRect()
    const header =
      element.querySelector('thead')?.getBoundingClientRect().bottom ??
      frame.top
    if (x < frame.left || x > frame.right || y < header || y > frame.bottom)
      return null
    const rows = [
      ...element.querySelectorAll<HTMLTableRowElement>('tr[data-column-id]'),
    ]
    return (
      (
        rows.find((row) => row.getBoundingClientRect().bottom >= y) ??
        rows.at(-1)
      )?.dataset.columnId ?? null
    )
  }
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    current.x = event.clientX
    current.y = event.clientY
    if (!current.active) {
      if (
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) < 5
      )
        return
      current.active = true
      setDraggedId(current.columnId)
    }
    event.preventDefault()
    setOverId(targetAt(current.x, current.y))
  }
  const finishDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancel = false,
  ) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const target =
      !cancel && current.active ? targetAt(event.clientX, event.clientY) : null
    drag.current = null
    setDraggedId(null)
    setOverId(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (target) reorder(current.columnId, target)
  }
  useEffect(() => {
    if (!draggedId) return
    let frame = 0
    const scroll = () => {
      const current = drag.current
      const element = region.current
      if (!current?.active || !element) return
      const bounds = element.getBoundingClientRect()
      if (current.x >= bounds.left && current.x <= bounds.right) {
        if (current.y < bounds.top + 64) element.scrollTop -= 8
        else if (current.y > bounds.bottom - 32) element.scrollTop += 8
        setOverId(targetAt(current.x, current.y))
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [draggedId])

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Columns3 className="size-4" />
              Colonnes du tableau{' '}
              <Badge variant="secondary">{columns.length}/50</Badge>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Déplacez les colonnes par leur poignée. Les champs s’affichent
              directement ; utilisez le crayon pour les affichages particuliers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!columns.length}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye />
              Prévisualiser
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!remaining}
              onClick={() => {
                setSelectedKeys([])
                setAddSearch('')
                setAddOpen(true)
              }}
            >
              <Plus />
              Ajouter des colonnes
            </Button>
          </div>
        </div>
        {duplicates && (
          <p role="alert" className="text-sm text-destructive">
            Certaines colonnes sont présentes plusieurs fois. Retirez les
            doublons avant d’appliquer la vue.
          </p>
        )}
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
              {columns.map((column, index) => (
                <TableRow
                  key={column.id}
                  data-column-id={column.id}
                  className={
                    overId === column.id && draggedId !== column.id
                      ? columns.findIndex((entry) => entry.id === draggedId) <
                        index
                        ? 'bg-accent shadow-[inset_0_-2px_0_var(--primary)]'
                        : 'bg-accent shadow-[inset_0_2px_0_var(--primary)]'
                      : draggedId === column.id
                        ? 'opacity-50'
                        : ''
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex size-8 shrink-0 touch-none select-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring cursor-grab active:cursor-grabbing"
                        aria-label={`Déplacer ${column.label}`}
                        title="Glisser pour déplacer · Alt + flèche haut/bas"
                        onPointerDown={(event) => {
                          if (
                            event.button !== 0 &&
                            event.pointerType === 'mouse'
                          )
                            return
                          event.preventDefault()
                          event.currentTarget.focus({ preventScroll: true })
                          event.currentTarget.setPointerCapture(event.pointerId)
                          drag.current = {
                            columnId: column.id,
                            pointerId: event.pointerId,
                            startX: event.clientX,
                            startY: event.clientY,
                            x: event.clientX,
                            y: event.clientY,
                            active: false,
                          }
                        }}
                        onPointerMove={pointerMove}
                        onPointerUp={(event) => finishDrag(event)}
                        onPointerCancel={(event) => finishDrag(event, true)}
                        onLostPointerCapture={() => {
                          drag.current = null
                          setDraggedId(null)
                          setOverId(null)
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.altKey &&
                            (event.key === 'ArrowUp' ||
                              event.key === 'ArrowDown')
                          ) {
                            event.preventDefault()
                            move(column, event.key === 'ArrowUp' ? -1 : 1)
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
                      title={choiceFor(column)?.label}
                    >
                      {choiceFor(column)?.label ?? 'Colonne indisponible'}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {choiceFor(column)?.group}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Libellé de ${choiceFor(column)?.label ?? column.label}`}
                      value={column.label}
                      maxLength={255}
                      className="h-8 min-w-40 max-w-72"
                      onChange={(event) =>
                        update(index, { label: event.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="max-w-48 truncate font-normal"
                      title={displayLabel(column)}
                    >
                      {displayLabel(column)}
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
                        onClick={() => move(column, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === columns.length - 1}
                        aria-label={`Descendre ${column.label}`}
                        onClick={() => move(column, 1)}
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
                          onClick={() => setEditingId(column.id)}
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
                        onClick={() =>
                          onChange(
                            columns.filter((entry) => entry.id !== column.id),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ajouter des colonnes</DialogTitle>
            <DialogDescription>
              Choisissez les champs et les relations à afficher. Chaque colonne
              ne peut être ajoutée qu’une fois.
            </DialogDescription>
          </DialogHeader>
          <Label className="sr-only" htmlFor={`${id}-add-search`}>
            Rechercher une colonne à ajouter
          </Label>
          <Input
            id={`${id}-add-search`}
            value={addSearch}
            maxLength={255}
            placeholder="Rechercher un champ ou une relation…"
            onChange={(event) => setAddSearch(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {selectedKeys.length} sélectionnée(s) · {remaining} place(s)
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!availableChoices.length}
              onClick={() =>
                setSelectedKeys(
                  availableChoices
                    .slice(0, remaining)
                    .map((choice) => choice.key),
                )
              }
            >
              Sélectionner les disponibles
            </Button>
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto rounded-lg border p-3">
            {['Champs', 'Champs système', 'Relations', 'Présentation'].map(
              (group) => {
                const items = visibleChoices.filter(
                  (choice) => choice.group === group,
                )
                return items.length ? (
                  <section key={group}>
                    <h4 className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                      {group}
                    </h4>
                    {items.map((choice) => {
                      const present = keys.has(choice.key)
                      return (
                        <label
                          key={choice.key}
                          className={`flex items-center gap-3 rounded-lg p-2 ${present ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-muted'}`}
                        >
                          <Checkbox
                            checked={
                              present || selectedKeys.includes(choice.key)
                            }
                            disabled={
                              present ||
                              (!selectedKeys.includes(choice.key) &&
                                selectedKeys.length >= remaining)
                            }
                            onCheckedChange={(checked) =>
                              setSelectedKeys((previous) =>
                                checked
                                  ? [...previous, choice.key]
                                  : previous.filter(
                                      (key) => key !== choice.key,
                                    ),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 text-sm">
                            {choice.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {present ? 'Déjà ajoutée' : choice.detail}
                          </span>
                        </label>
                      )
                    })}
                  </section>
                ) : null
              },
            )}
            {!visibleChoices.length && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Aucune colonne ne correspond à cette recherche.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!selectedKeys.length}
              onClick={() => {
                const added = choices
                  .filter(
                    (choice) =>
                      selectedKeys.includes(choice.key) &&
                      !keys.has(choice.key),
                  )
                  .slice(0, remaining)
                  .map((choice): ViewColumn => ({
                    id: crypto.randomUUID(),
                    label: choice.label,
                    kind: choice.kind,
                    field_id: choice.fieldId ?? null,
                    relation_id: choice.relationId ?? null,
                    profile_id: null,
                    direction: choice.direction ?? 'outgoing',
                    collection_display: 'list',
                  }))
                onChange([...columns, ...added])
                setAddOpen(false)
              }}
            >
              Ajouter {selectedKeys.length} colonne
              {selectedKeys.length > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85dvh] min-w-0 overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Prévisualisation de la vue</DialogTitle>
            <DialogDescription>
              L’ordre et l’affichage des colonnes sont ceux de votre brouillon.
            </DialogDescription>
          </DialogHeader>
          <ConfigurationPreview
            type={{
              ...type,
              configuration: {
                ...type.configuration,
                views: columns.length
                  ? [
                      {
                        id: 'draft-preview',
                        name: 'Vue en cours',
                        columns,
                        is_default: true,
                      },
                    ]
                  : [],
              },
            }}
            catalog={catalog}
            compact
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Affichage de {editing?.label}</DialogTitle>
            <DialogDescription>
              Configurez la présentation de cette colonne. Son contenu est fixé
              lors de l’ajout.
            </DialogDescription>
          </DialogHeader>
          {editing &&
            [editing].map((column) => {
              const index = columns.indexOf(column)
              const path = paths.find(
                (entry) =>
                  entry.id === column.relation_id &&
                  entry.direction === column.direction,
              )
              const target =
                column.kind === 'display'
                  ? type
                  : path?.type_ids.length === 1
                    ? catalog.find((entry) => entry.id === path.type_ids[0])
                    : undefined
              return (
                <div
                  key={column.id}
                  className="min-h-0 space-y-4 overflow-y-auto p-1"
                >
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    {choiceFor(column)?.label}
                  </p>
                  {(column.kind === 'relation' || column.kind === 'count') && (
                    <div className="space-y-2">
                      <Label htmlFor={`${id}-relation-display`}>Afficher</Label>
                      <NativeSelect
                        id={`${id}-relation-display`}
                        className="w-full"
                        value={column.kind}
                        onChange={(event) =>
                          update(index, {
                            kind: event.target.value as 'relation' | 'count',
                            profile_id: null,
                          })
                        }
                      >
                        <NativeSelectOption value="relation">
                          Les éléments liés
                        </NativeSelectOption>
                        <NativeSelectOption value="count">
                          Le nombre d’éléments liés
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                  )}
                  {(column.kind === 'relation' ||
                    column.kind === 'display') && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor={`${id}-${column.id}-profile`}>
                          Profil d’affichage
                        </Label>
                        <NativeSelect
                          id={`${id}-${column.id}-profile`}
                          className="w-full"
                          value={column.profile_id ?? ''}
                          onChange={(event) =>
                            update(index, {
                              profile_id: event.target.value || null,
                            })
                          }
                        >
                          <NativeSelectOption value="">
                            Affichage par défaut de chaque type lié
                          </NativeSelectOption>
                          {target?.configuration.display_profiles.map(
                            (profile) => (
                              <NativeSelectOption
                                key={profile.id}
                                value={profile.id}
                              >
                                {profile.name}
                              </NativeSelectOption>
                            ),
                          )}
                        </NativeSelect>
                        {target && onSaveRelatedProfile && (
                          <div className="space-y-2 pt-1">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  target.configuration.display_profiles
                                    .length >= 50
                                }
                                onClick={() =>
                                  setProfileEditor({
                                    target,
                                    columnId: column.id,
                                  })
                                }
                              >
                                <Plus />
                                Créer un profil sur {target.name}
                              </Button>
                              {(() => {
                                const selectedProfile =
                                  target.configuration.display_profiles.find(
                                    (profile) =>
                                      profile.id === column.profile_id,
                                  ) ??
                                  (!column.profile_id
                                    ? target.configuration.display_profiles.find(
                                        (profile) => profile.is_default,
                                      )
                                    : undefined)
                                return selectedProfile ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setProfileEditor({
                                        target,
                                        columnId: column.id,
                                        profile: selectedProfile,
                                      })
                                    }
                                  >
                                    <Pencil />
                                    Modifier « {selectedProfile.name} »
                                  </Button>
                                ) : null
                              })()}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Un profil combine les champs de {target.name} :
                              titre, sous-titre et image. Il est réutilisable
                              dans les autres vues.
                            </p>
                          </div>
                        )}
                        {!target && path && (
                          <p className="text-xs text-muted-foreground">
                            Cette relation accepte plusieurs types. Chaque type
                            lié utilise son propre profil par défaut.
                          </p>
                        )}
                      </div>
                      {path?.many && (
                        <div className="space-y-1">
                          <Label htmlFor={`${id}-${column.id}-collection`}>
                            Présentation de la collection
                          </Label>
                          <NativeSelect
                            id={`${id}-${column.id}-collection`}
                            value={column.collection_display}
                            onChange={(event) =>
                              update(index, {
                                collection_display: event.target.value as
                                  'list' | 'first',
                              })
                            }
                          >
                            <NativeSelectOption value="list">
                              Liste compacte
                            </NativeSelectOption>
                            <NativeSelectOption value="first">
                              Premier élément et compteur des autres
                            </NativeSelectOption>
                          </NativeSelect>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          <DialogFooter>
            <Button type="button" onClick={() => setEditingId(null)}>
              Terminé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {profileEditor && onSaveRelatedProfile && (
        <DefinitionSheet
          key={`${profileEditor.target.id}/${profileEditor.profile?.id ?? 'new'}`}
          kind="display_profiles"
          item={profileEditor.profile}
          type={profileEditor.target}
          catalog={catalog}
          description={
            profileEditor.target.id === type.id
              ? `${type.name} · Le profil sera ajouté au brouillon avec cette vue.`
              : `${profileEditor.target.name} · Ce profil sera enregistré sur ce type et réutilisable dans ses vues. La vue actuelle reste en brouillon. Modifier un profil existant affecte toutes les vues qui l’utilisent.`
          }
          saveLabel={
            profileEditor.target.id === type.id
              ? 'Appliquer au brouillon'
              : 'Enregistrer le profil'
          }
          onBusyChange={onBusyChange}
          onDirtyChange={onDirtyChange}
          onClose={() => setProfileEditor(null)}
          onSave={async (item) => {
            await onSaveRelatedProfile(
              profileEditor.target,
              item as DisplayProfile,
            )
            onChange(
              columns.map((column) =>
                column.id === profileEditor.columnId
                  ? {
                      ...column,
                      profile_id: profileEditor.profile
                        ? column.profile_id
                        : item.id,
                    }
                  : column,
              ),
            )
          }}
        />
      )}
    </>
  )
}
