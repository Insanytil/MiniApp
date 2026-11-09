import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  EyeOff,
  FileIcon,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { useServerList } from '@/components/data-table/use-server-list'
import { useListPageBoundary } from '@/components/data-table/use-list-page-boundary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError, errorMessage } from '@/lib/api/client'
import {
  deleteFile,
  filesKey,
  getFileDownload,
  listManagedFiles,
  renameFile,
  setFileAvailability,
} from './api'
import type { ManagedFile } from './api'
import { RecordImage } from './record-image'
import { imageContentTypes } from './policy'
import { FileNameDialog } from './file-name-dialog'
import { FileUploadDialog } from './file-upload-dialog'

const emptyFiles: ManagedFile[] = []
export function FileManagerPage() {
  const { organization } = useAuth()
  return organization ? (
    <ScopedFileManager key={organization.id} organizationId={organization.id} />
  ) : null
}

function ScopedFileManager({ organizationId }: { organizationId: string }) {
  const client = useQueryClient()
  const list = useServerList()
  const [linked, setLinked] = useState('all')
  const [selectable, setSelectable] = useState('all')
  const [renaming, setRenaming] = useState<ManagedFile | null>(null)
  const [deleting, setDeleting] = useState<ManagedFile | null>(null)
  const [uploading, setUploading] = useState<File | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const query = useQuery({
    queryKey: [
      ...filesKey(organizationId),
      'manager',
      list.params,
      linked,
      selectable,
    ],
    queryFn: ({ signal }) =>
      listManagedFiles(organizationId, {
        offset: (list.params.page - 1) * list.params.pageSize,
        limit: list.params.pageSize,
        search: list.params.search,
        linked: linked === 'all' ? undefined : linked === 'linked',
        selectable:
          selectable === 'all' ? undefined : selectable === 'available',
        signal,
      }),
  })
  useListPageBoundary(
    {
      data: query.data
        ? {
            pagination: {
              total_pages: Math.ceil(query.data.total / list.params.pageSize),
            },
          }
        : undefined,
      isPlaceholderData: false,
    },
    list,
  )
  const refresh = () =>
    client.invalidateQueries({ queryKey: filesKey(organizationId) })
  const mutation = useMutation({
    mutationFn: async ({
      file,
      action,
    }: {
      file: ManagedFile
      action: 'delete' | 'availability' | 'download'
    }) => {
      if (action === 'delete') return deleteFile(file.id, organizationId)
      if (action === 'availability')
        return setFileAvailability(file.id, organizationId, !file.is_selectable)
      const result = await getFileDownload(file.id, organizationId)
      window.location.assign(result.url)
    },
    retry: false,
    onSuccess: async (_, variables) => {
      if (variables.action !== 'download') await refresh()
      if (variables.action === 'delete') setDeleting(null)
    },
    onError: () => {
      void refresh()
    },
  })
  const busy = query.isFetching || mutation.isPending || list.isDebouncing
  const columns = useMemo<ServerColumn<ManagedFile>[]>(
    () => [
      {
        accessorKey: 'filename',
        header: 'Fichier',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            {row.original.state === 'ready' &&
            imageContentTypes.includes(row.original.content_type) ? (
              <RecordImage
                url={`file:${row.original.id}`}
                organizationId={organizationId}
                variant="avatar"
              />
            ) : (
              <FileIcon className="size-8 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p
                className="max-w-64 truncate font-medium"
                title={row.original.filename}
              >
                {row.original.filename}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.original.content_type} ·{' '}
                {Math.max(1, Math.ceil(row.original.size_bytes / 1024))} Ko
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'usage_count',
        header: 'Utilisation',
        cell: ({ row }) => (
          <Badge variant={row.original.usage_count ? 'secondary' : 'outline'}>
            {row.original.usage_count
              ? `${row.original.usage_count} fiche(s)`
              : 'Non lié'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_selectable',
        header: 'Sélection',
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.state !== 'ready'
              ? 'Dépôt en attente'
              : row.original.is_selectable
                ? 'Disponible'
                : 'Indisponible'}
          </Badge>
        ),
      },
    ],
    [organizationId],
  )
  const renderActions = useCallback(
    (file: ManagedFile) => (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || file.state !== 'ready'}
          aria-label={`Télécharger ${file.filename}`}
          onClick={() => mutation.mutate({ file, action: 'download' })}
        >
          <Download />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          aria-label={`Renommer ${file.filename}`}
          onClick={() => setRenaming(file)}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || file.state !== 'ready'}
          aria-label={`${file.is_selectable ? 'Rendre indisponible' : 'Rendre disponible'} ${file.filename}`}
          title={
            file.is_selectable
              ? 'Masquer des sélections, en conservant les liens existants'
              : 'Rendre disponible à la sélection'
          }
          onClick={() => mutation.mutate({ file, action: 'availability' })}
        >
          <EyeOff />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || file.usage_count > 0}
          title={
            file.usage_count
              ? 'Retirez les liens avant de supprimer ce fichier'
              : 'Supprimer'
          }
          aria-label={`Supprimer ${file.filename}`}
          onClick={() => {
            mutation.reset()
            setDeleting(file)
          }}
        >
          <Trash2 />
        </Button>
      </div>
    ),
    [busy, mutation],
  )
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Fichiers
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Retrouvez vos fichiers et gérez leur utilisation dans
            l’organisation.
          </p>
        </div>
        <Button type="button" onClick={() => input.current?.click()}>
          <Upload />
          Déposer un fichier
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          aria-label="Choisir un fichier à déposer"
          onChange={(event) => {
            setUploading(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      </div>
      <div className="flex shrink-0 flex-wrap gap-4">
        <div className="space-y-1">
          <Label htmlFor="file-link-filter">Utilisation</Label>
          <NativeSelect
            id="file-link-filter"
            value={linked}
            onChange={(event) => {
              setLinked(event.target.value)
              list.setParams((previous) => ({ ...previous, page: 1 }))
            }}
          >
            <NativeSelectOption value="all">
              Tous les fichiers
            </NativeSelectOption>
            <NativeSelectOption value="linked">
              Liés à une fiche
            </NativeSelectOption>
            <NativeSelectOption value="unlinked">Non liés</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="file-availability-filter">Disponibilité</Label>
          <NativeSelect
            id="file-availability-filter"
            value={selectable}
            onChange={(event) => {
              setSelectable(event.target.value)
              list.setParams((previous) => ({ ...previous, page: 1 }))
            }}
          >
            <NativeSelectOption value="all">Toutes</NativeSelectOption>
            <NativeSelectOption value="available">
              Disponibles
            </NativeSelectOption>
            <NativeSelectOption value="unavailable">
              Indisponibles
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {(query.isError || mutation.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutation.error instanceof ApiError && mutation.error.status === 409
              ? 'Ce fichier est utilisé. Retirez ses liens avant de le supprimer.'
              : errorMessage(mutation.error ?? query.error)}
            {query.isError && (
              <Button variant="outline" onClick={() => void query.refetch()}>
                Réessayer
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <ServerTable
        label="fichiers"
        rows={query.data?.items ?? emptyFiles}
        columns={columns}
        renderActions={renderActions}
        total={query.data?.total ?? 0}
        pagination={list.pagination}
        onPaginationChange={list.onPaginationChange}
        search={list.search}
        onSearchChange={list.setSearch}
        searchMaxLength={255}
        busy={busy}
        loading={query.isPending}
        failed={query.isError}
      />
      {renaming && (
        <FileNameDialog
          title="Renommer le fichier"
          initialName={renaming.filename}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await renameFile(renaming.id, organizationId, name)
            await refresh()
          }}
        />
      )}
      {uploading && (
        <FileUploadDialog
          file={uploading}
          organizationId={organizationId}
          onClose={() => setUploading(null)}
        />
      )}
      {deleting && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setDeleting(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce fichier ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le fichier « {deleting.filename} » sera supprimé définitivement
                du stockage. Cette action est possible uniquement s’il n’est
                plus lié à une fiche.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {mutation.error instanceof ApiError &&
                  mutation.error.status === 409
                    ? 'Ce fichier est maintenant lié à une fiche. Sa suppression est bloquée.'
                    : errorMessage(mutation.error)}
                </AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setDeleting(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ file: deleting, action: 'delete' })
                }
              >
                Supprimer
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
