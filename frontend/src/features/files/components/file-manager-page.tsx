import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ServerTable } from '@/components/data-table/server-table'
import { useServerList } from '@/components/data-table/use-server-list'
import { useListPageBoundary } from '@/components/data-table/use-list-page-boundary'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ApiError, errorMessage } from '@/lib/api/client'
import {
  deleteFile,
  filesKey,
  getFileDownload,
  listManagedFiles,
  renameFile,
  setFileAvailability,
} from '../api'
import type { ManagedFile } from '../api'
import { FileActions, fileColumns } from './file-columns'
import { FileFilters, filterFlag } from './file-filters'
import type { AvailabilityFilter, LinkFilter } from './file-filters'
import { FileNameDialog } from './file-name-dialog'
import { FileUploadDialog } from './file-upload-dialog'

/** A 409 on a file means it is (still or again) linked to a record. */
const fileError = (error: unknown, conflict: string) =>
  error instanceof ApiError && error.status === 409
    ? conflict
    : errorMessage(error)

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
  const [linked, setLinked] = useState<LinkFilter>('all')
  const [selectable, setSelectable] = useState<AvailabilityFilter>('all')
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
        linked: filterFlag(linked, 'linked'),
        selectable: filterFlag(selectable, 'available'),
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
  const columns = useMemo(() => fileColumns(organizationId), [organizationId])
  const renderActions = useCallback(
    (file: ManagedFile) => (
      <FileActions
        file={file}
        busy={busy}
        onDownload={() => mutation.mutate({ file, action: 'download' })}
        onRename={() => setRenaming(file)}
        onToggleAvailability={() =>
          mutation.mutate({ file, action: 'availability' })
        }
        onDelete={() => {
          mutation.reset()
          setDeleting(file)
        }}
      />
    ),
    [busy, mutation],
  )
  const firstPage = () =>
    list.setParams((previous) => ({ ...previous, page: 1 }))
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
      <FileFilters
        linked={linked}
        selectable={selectable}
        onLinkedChange={(value) => {
          setLinked(value)
          firstPage()
        }}
        onSelectableChange={(value) => {
          setSelectable(value)
          firstPage()
        }}
      />
      {(query.isError || mutation.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {fileError(
              mutation.error ?? query.error,
              'Ce fichier est utilisé. Retirez ses liens avant de le supprimer.',
            )}
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
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Supprimer ce fichier ?"
          description={`Le fichier « ${deleting.filename} » sera supprimé définitivement du stockage. Cette action est possible uniquement s’il n’est plus lié à une fiche.`}
          confirmLabel="Supprimer"
          destructive
          disabled={mutation.isPending}
          onConfirm={() =>
            mutation.mutate({ file: deleting, action: 'delete' })
          }
        >
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {fileError(
                  mutation.error,
                  'Ce fichier est maintenant lié à une fiche. Sa suppression est bloquée.',
                )}
              </AlertDescription>
            </Alert>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
