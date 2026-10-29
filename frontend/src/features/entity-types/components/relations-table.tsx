import { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
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
import { dependentDefinitions } from '../configuration'
import type { ConfiguredEntityType, RelationDefinition } from '../configuration'
import { relationRows } from '../relations'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

export function RelationsTable({
  type,
  catalog,
  busy,
  onAdd,
  onEdit,
  onRemove,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  busy: boolean
  onAdd: () => void
  onEdit: (relation: RelationDefinition) => void
  onRemove: (relation: RelationDefinition) => void
}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState('')
  const rows = relationRows(type.id, catalog)
  const filtered = !!search.trim() || !!direction
  const visible = rows.filter(
    (row) =>
      (!direction || row.direction === direction) &&
      normalize(
        [
          row.name,
          row.definition.name,
          row.definition.inverse_name,
          row.definition.technical_name,
          ...row.linkedTypes,
        ].join(' '),
      ).includes(normalize(search.trim())),
  )
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1 sm:max-w-sm">
          <Label htmlFor={`${id}-search`} className="sr-only">
            Rechercher une relation
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
            placeholder="Rechercher une relation…"
            className="h-9 bg-background pr-9 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1 right-1"
              aria-label="Effacer la recherche de relations"
              onClick={() => setSearch('')}
            >
              <X />
            </Button>
          )}
        </div>
        <Label htmlFor={`${id}-direction`} className="sr-only">
          Filtrer les relations par sens
        </Label>
        <NativeSelect
          id={`${id}-direction`}
          value={direction}
          disabled={busy}
          onChange={(e) => setDirection(e.target.value)}
        >
          <NativeSelectOption value="">Sens · Tous</NativeSelectOption>
          <NativeSelectOption value="outgoing">Directes</NativeSelectOption>
          <NativeSelectOption value="incoming">Inverses</NativeSelectOption>
        </NativeSelect>
        <p role="status" className="px-1 text-xs text-muted-foreground">
          {filtered ? `${visible.length} sur ${rows.length}` : rows.length}{' '}
          relation{rows.length > 1 ? 's' : ''}
        </p>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={onAdd}
        >
          <Plus /> Ajouter une relation
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <Table
          aria-label="Relations de l’entité"
          className="min-w-[880px]"
          containerProps={{
            className:
              'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain',
            tabIndex: 0,
            role: 'region',
            'aria-label': 'Tableau des relations de l’entité',
          }}
        >
          <TableHeader className="sticky top-0 z-20 bg-muted">
            <TableRow>
              <TableHead scope="col" className="w-[28%] pl-4">
                Relation
              </TableHead>
              <TableHead scope="col">Sens</TableHead>
              <TableHead scope="col">Type lié</TableHead>
              <TableHead scope="col">Cardinalité</TableHead>
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
            {visible.map((row) => {
              const inverse = row.direction === 'incoming'
              const dependencies = dependentDefinitions(row.id, catalog)
              return (
                <TableRow
                  key={`${row.id}:${row.direction}`}
                  data-relation-id={row.id}
                  data-direction={row.direction}
                >
                  <TableCell className="py-3 pl-4">
                    <p
                      className="max-w-64 truncate font-medium"
                      title={row.name}
                    >
                      {row.name}
                    </p>
                    <code className="text-xs text-muted-foreground">
                      {row.definition.technical_name}
                    </code>
                  </TableCell>
                  <TableCell>
                    {inverse ? (
                      <Popover>
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              className="rounded-full focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                              aria-label={`Informations sur la relation inverse ${row.name}`}
                            />
                          }
                        >
                          <Badge
                            variant="outline"
                            className="cursor-help gap-1 font-normal"
                          >
                            <ArrowDownLeft className="size-3" />
                            Inverse
                          </Badge>
                        </PopoverTrigger>
                        <PopoverContent align="start">
                          <PopoverTitle>
                            Relation inverse · {row.name}
                          </PopoverTitle>
                          <p className="text-xs text-muted-foreground">
                            Cette navigation est créée automatiquement depuis «{' '}
                            {row.definition.name} », définie sur {row.ownerName}
                            . L’obligation et la suppression du lien sont
                            configurées sur ce type.
                          </p>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <ArrowUpRight className="size-3" />
                        Directe
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {row.linkedTypes.map((name, i) => (
                        <p
                          key={`${name}-${i}`}
                          className="max-w-48 truncate text-sm"
                          title={name}
                        >
                          {name}
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{row.cardinality}</TableCell>
                  <TableCell>
                    {inverse ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title={`Obligation définie côté ${row.ownerName}`}
                      >
                        Côté {row.ownerName}
                      </span>
                    ) : row.definition.required ? (
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
                              className="rounded-full font-normal"
                              aria-label={`Voir les utilisations de ${row.name}`}
                            />
                          }
                        >
                          {dependencies.length} utilisation
                          {dependencies.length > 1 ? 's' : ''}
                        </PopoverTrigger>
                        <PopoverContent align="start">
                          <PopoverTitle>
                            Utilisation de la relation
                          </PopoverTitle>
                          <p className="text-xs text-muted-foreground">
                            Références à cette relation, dans les deux sens.
                          </p>
                          <ul className="space-y-1 text-xs">
                            {dependencies.map((name, i) => (
                              <li key={`${name}-${i}`}>{name}</li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Non utilisée
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="sticky right-0 bg-card text-right">
                    <div className="flex justify-end gap-1">
                      {row.ownerId === type.id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Modifier ${row.name}`}
                          title={
                            inverse
                              ? 'Modifier la définition de cette relation'
                              : 'Modifier la relation'
                          }
                          onClick={() => onEdit(row.definition)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Configurer ${row.name} sur ${row.ownerName}`}
                          title={`Configurer la relation sur ${row.ownerName}`}
                          render={
                            <Link
                              to="/organization/entity-types/$entityTypeId"
                              params={{ entityTypeId: row.ownerId }}
                            />
                          }
                        >
                          <ExternalLink className="size-3.5" />
                        </Button>
                      )}
                      {!inverse && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy || dependencies.length > 0}
                          aria-label={`Supprimer ${row.name}`}
                          title={
                            dependencies.length
                              ? 'Retirez les utilisations avant de supprimer cette relation.'
                              : 'Supprimer la relation et sa navigation inverse'
                          }
                          className="text-destructive hover:text-destructive"
                          onClick={() => onRemove(row.definition)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {!visible.length && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground"
                >
                  {rows.length
                    ? 'Aucune relation ne correspond aux filtres.'
                    : 'Aucune relation. Ajoutez une relation pour relier vos entités.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
