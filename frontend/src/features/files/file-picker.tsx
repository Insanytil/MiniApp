import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileIcon, LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { errorMessage } from '@/lib/api/client'
import { filesKey, listFiles } from './api'
import type { StoredFile } from './api'
import { RecordImage } from './record-image'
import { imageContentTypes } from './policy'

const pageSize = 18

export function FilePicker({
  organizationId,
  imagesOnly = false,
  selectedId,
  onSelect,
  onClose,
}: {
  organizationId: string
  imagesOnly?: boolean
  selectedId?: string | null
  onSelect: (file: StoredFile) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const term = useDebouncedValue(search.trim())
  const searching = term !== search.trim()
  const query = useQuery({
    queryKey: [
      ...filesKey(organizationId),
      'picker',
      { term, page, imagesOnly },
    ],
    queryFn: ({ signal }) =>
      listFiles(organizationId, page * pageSize, pageSize + 1, {
        search: term,
        imagesOnly,
        signal,
      }),
    retry: false,
  })
  const items = query.data?.slice(0, pageSize) ?? []
  const hasNext = (query.data?.length ?? 0) > pageSize
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {imagesOnly
              ? 'Choisir une image existante'
              : 'Choisir un fichier existant'}
          </DialogTitle>
          <DialogDescription>
            Réutilisez un fichier de cette organisation sans le déposer à
            nouveau.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          aria-label="Rechercher un fichier par son nom"
          placeholder="Rechercher par nom…"
          maxLength={255}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
        />
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          aria-busy={query.isFetching || searching}
        >
          {query.isPending || searching ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              Chargement des fichiers…
            </p>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {errorMessage(query.error)}{' '}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                >
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <p
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              {term
                ? 'Aucun fichier ne correspond à cette recherche.'
                : 'Aucun fichier disponible. Déposez votre premier fichier pour le retrouver ici.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 py-1 sm:grid-cols-3">
              {items.map((file) => (
                <li
                  key={file.id}
                  className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${file.id === selectedId ? 'border-primary bg-primary/5' : ''}`}
                >
                  {imageContentTypes.includes(file.content_type) ? (
                    <RecordImage
                      url={`file:${file.id}`}
                      organizationId={organizationId}
                      variant="picker"
                    />
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-lg bg-muted">
                      <FileIcon className="size-10 text-muted-foreground" />
                    </div>
                  )}
                  <p
                    className="truncate text-sm font-medium"
                    title={file.filename}
                  >
                    {file.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.max(1, Math.ceil(file.size_bytes / 1024))} Ko
                  </p>
                  <Button
                    type="button"
                    variant={file.id === selectedId ? 'secondary' : 'outline'}
                    size="sm"
                    aria-label={`Choisir ${file.filename}`}
                    aria-pressed={file.id === selectedId}
                    disabled={query.isFetching || searching}
                    onClick={() => onSelect(file)}
                  >
                    {file.id === selectedId ? 'Sélectionné' : 'Choisir'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page === 0 || query.isFetching || searching}
            onClick={() => setPage((previous) => previous - 1)}
          >
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              !hasNext || query.isFetching || searching || query.isError
            }
            onClick={() => setPage((previous) => previous + 1)}
          >
            Suivant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
