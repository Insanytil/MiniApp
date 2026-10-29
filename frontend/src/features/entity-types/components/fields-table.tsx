import { useId, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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

const symbols: Record<FieldKind, string> = {
  text: 'Aa',
  email: '@',
  integer: '123',
  decimal: '1.0',
  boolean: '0/1',
  date: 'Date',
  datetime: 'Date',
  image: 'Img',
}
const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

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
  const id = useId()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [required, setRequired] = useState('')
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const fields = type.configuration.fields
  const allFields = [
    ...fields.map((field) => ({ ...field, system: false })),
    ...type.available_system_fields.map((field) => ({
      ...field,
      system: true,
    })),
  ]
  const filtered = !!search.trim() || !!kind || !!required
  const visible = allFields.filter(
    (field) =>
      searchable(`${field.name} ${field.technical_name}`).includes(
        searchable(search.trim()),
      ) &&
      (!kind || field.kind === kind) &&
      (!required || field.required === (required === 'required')),
  )
  const reorder = (sourceId: string, targetIndex: number) => {
    if (busy || filtered) return
    const index = fields.findIndex((field) => field.id === sourceId)
    if (
      index < 0 ||
      index === targetIndex ||
      targetIndex < 0 ||
      targetIndex >= fields.length
    )
      return
    const next = [...fields]
    const [field] = next.splice(index, 1)
    next.splice(targetIndex, 0, field)
    onReorder(next)
    setAnnouncement(
      `${field.name} déplacé en position ${targetIndex + 1} sur ${fields.length}.`,
    )
  }
  const reset = () => {
    setSearch('')
    setKind('')
    setRequired('')
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1 sm:max-w-sm">
          <Label htmlFor={`${id}-search`} className="sr-only">
            Rechercher un champ
          </Label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${id}-search`}
            value={search}
            disabled={busy}
            maxLength={255}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un champ…"
            className="h-9 bg-background pr-9 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1 right-1"
              aria-label="Effacer la recherche de champs"
              onClick={() => setSearch('')}
            >
              <X />
            </Button>
          )}
        </div>
        <Label htmlFor={`${id}-kind`} className="sr-only">
          Filtrer les champs par type
        </Label>
        <NativeSelect
          id={`${id}-kind`}
          value={kind}
          disabled={busy}
          onChange={(e) => setKind(e.target.value)}
        >
          <NativeSelectOption value="">Type · Tous</NativeSelectOption>
          {Object.entries(fieldKinds).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Label htmlFor={`${id}-required`} className="sr-only">
          Filtrer les champs par obligation
        </Label>
        <NativeSelect
          id={`${id}-required`}
          value={required}
          disabled={busy}
          onChange={(e) => setRequired(e.target.value)}
        >
          <NativeSelectOption value="">Requis · Tous</NativeSelectOption>
          <NativeSelectOption value="required">Requis</NativeSelectOption>
          <NativeSelectOption value="optional">Optionnels</NativeSelectOption>
        </NativeSelect>
        <p role="status" className="px-1 text-xs text-muted-foreground">
          {filtered
            ? `${visible.length} sur ${allFields.length}`
            : allFields.length}{' '}
          champ{allFields.length > 1 ? 's' : ''}
        </p>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={onAdd}
        >
          <Plus /> Ajouter un champ
        </Button>
      </div>
      {filtered && (
        <p className="shrink-0 text-xs text-muted-foreground">
          Réinitialisez les filtres pour réordonner les champs.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={reset}
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
                      <Popover>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy || filtered}
                              draggable={!busy && !filtered}
                              aria-label={`Déplacer ${field.name}`}
                              title="Glisser pour déplacer, ou Alt + flèche haut/bas"
                              onKeyDown={(e) => {
                                if (
                                  e.altKey &&
                                  (e.key === 'ArrowUp' || e.key === 'ArrowDown')
                                ) {
                                  e.preventDefault()
                                  reorder(
                                    field.id,
                                    index + (e.key === 'ArrowUp' ? -1 : 1),
                                  )
                                }
                              }}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', field.id)
                                e.dataTransfer.effectAllowed = 'move'
                                setDragged(field.id)
                              }}
                              onDragEnd={() => {
                                setDragged(null)
                                setOver(null)
                              }}
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
                            onClick={() => reorder(field.id, index - 1)}
                          >
                            <ArrowUp /> Monter
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === fields.length - 1 || busy}
                            onClick={() => reorder(field.id, index + 1)}
                          >
                            <ArrowDown /> Descendre
                          </Button>
                        </PopoverContent>
                      </Popover>
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
                    {dependencies.length ? (
                      <Popover>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              aria-label={`Voir les utilisations de ${field.name}`}
                              className="rounded-full font-normal"
                            />
                          }
                        >
                          {dependencies.length} utilisation
                          {dependencies.length > 1 ? 's' : ''}
                        </PopoverTrigger>
                        <PopoverContent align="start">
                          <PopoverTitle>
                            Utilisation de {field.name}
                          </PopoverTitle>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {dependencies.map((name, i) => (
                              <li key={`${name}-${i}`}>{name}</li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Non utilisé
                      </span>
                    )}
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
