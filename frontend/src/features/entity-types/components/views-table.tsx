import { useId, useState } from 'react'
import { Check, Eye, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { ConfiguredEntityType, ViewDefinition } from '../configuration'
import { ConfigurationPreview } from './configuration-preview'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

export function ViewsTable({
  type,
  catalog,
  busy,
  onAdd,
  onEdit,
  onRemove,
  onSetDefault,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  busy: boolean
  onAdd: () => void
  onEdit: (view: ViewDefinition) => void
  onRemove: (view: ViewDefinition) => void
  onSetDefault: (view: ViewDefinition) => void
}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const views = type.configuration.views
  const visible = views.filter(
    (view) =>
      (!status || view.is_default === (status === 'default')) &&
      normalize(
        [view.name, ...view.columns.map((column) => column.label)].join(' '),
      ).includes(normalize(search.trim())),
  )
  const preview = views.find((view) => view.id === previewId)
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1 sm:max-w-sm">
          <Label htmlFor={`${id}-search`} className="sr-only">
            Rechercher une vue
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une vue ou une colonne…"
            className="h-9 bg-background pr-9 pl-9"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1 right-1"
              aria-label="Effacer la recherche de vues"
              onClick={() => setSearch('')}
            >
              <X />
            </Button>
          )}
        </div>
        <Label htmlFor={`${id}-status`} className="sr-only">
          Filtrer les vues par statut
        </Label>
        <NativeSelect
          id={`${id}-status`}
          value={status}
          disabled={busy}
          onChange={(event) => setStatus(event.target.value)}
        >
          <NativeSelectOption value="">Statut · Tous</NativeSelectOption>
          <NativeSelectOption value="default">Par défaut</NativeSelectOption>
          <NativeSelectOption value="other">Autres vues</NativeSelectOption>
        </NativeSelect>
        <p role="status" className="px-1 text-xs text-muted-foreground">
          {search.trim() || status
            ? `${visible.length} sur ${views.length}`
            : views.length}{' '}
          vue{views.length > 1 ? 's' : ''}
        </p>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={onAdd}
        >
          <Plus /> Ajouter une vue
        </Button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <Table
          aria-label="Vues de l’entité"
          className="min-w-[720px]"
          containerProps={{
            className:
              'min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain',
            tabIndex: 0,
            role: 'region',
            'aria-label': 'Tableau des vues de l’entité',
          }}
        >
          <TableHeader className="sticky top-0 z-20 bg-muted">
            <TableRow>
              <TableHead scope="col" className="w-[25%] pl-4">
                Vue
              </TableHead>
              <TableHead scope="col">Colonnes</TableHead>
              <TableHead scope="col">Composition</TableHead>
              <TableHead scope="col">Statut</TableHead>
              <TableHead
                scope="col"
                className="sticky right-0 bg-muted text-right"
              >
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((view) => (
              <TableRow key={view.id} data-view-id={view.id}>
                <TableCell className="py-3 pl-4">
                  <p
                    className="max-w-64 truncate font-medium"
                    title={view.name}
                  >
                    {view.name}
                  </p>
                </TableCell>
                <TableCell>
                  <span className="text-sm tabular-nums">
                    {view.columns.length}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {view.columns.slice(0, 3).map((column) => (
                      <Badge
                        key={column.id}
                        variant="secondary"
                        className="max-w-32 truncate font-normal"
                        title={column.label}
                      >
                        {column.label}
                      </Badge>
                    ))}
                    {view.columns.length > 3 && (
                      <Popover>
                        <PopoverTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="rounded-full"
                              aria-label={`Voir toutes les colonnes de ${view.name}`}
                            />
                          }
                        >
                          +{view.columns.length - 3}
                        </PopoverTrigger>
                        <PopoverContent align="start">
                          <PopoverTitle>Colonnes de {view.name}</PopoverTitle>
                          <ol className="max-h-64 list-inside list-decimal space-y-1 overflow-y-auto text-xs text-muted-foreground">
                            {view.columns.map((column) => (
                              <li key={column.id}>{column.label}</li>
                            ))}
                          </ol>
                        </PopoverContent>
                      </Popover>
                    )}
                    {!view.columns.length && (
                      <span className="text-xs text-muted-foreground">
                        Aucune colonne
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {view.is_default ? (
                    <Badge className="gap-1">
                      <Check className="size-3" />
                      Par défaut
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Définir ${view.name} comme vue par défaut`}
                      onClick={() => onSetDefault(view)}
                    >
                      <Star className="size-3.5" />
                      Définir par défaut
                    </Button>
                  )}
                </TableCell>
                <TableCell className="sticky right-0 bg-card text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Aperçu de ${view.name}`}
                      title="Aperçu du tableau"
                      onClick={() => setPreviewId(view.id)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Modifier ${view.name}`}
                      onClick={() => onEdit(view)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label={`Supprimer ${view.name}`}
                      title="Supprimer la vue du brouillon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onRemove(view)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-muted-foreground"
                >
                  {views.length
                    ? 'Aucune vue ne correspond aux filtres.'
                    : 'Aucune vue. Ajoutez une vue pour configurer votre tableau.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Aperçu · {preview?.name}</DialogTitle>
            <DialogDescription>
              Les colonnes sont affichées dans l’ordre configuré, avec des
              données fictives.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <ConfigurationPreview
              key={preview.id}
              type={{
                ...type,
                configuration: {
                  ...type.configuration,
                  views: [{ ...preview, is_default: true }],
                },
              }}
              catalog={catalog}
              compact
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
