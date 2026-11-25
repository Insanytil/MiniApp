import { Download, EyeOff, FileIcon, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ServerColumn } from '@/components/data-table/server-table'
import type { ManagedFile } from '../api'
import { imageContentTypes } from '../policy'
import { RecordImage } from './record-image'

const sizeInKb = (bytes: number) => Math.max(1, Math.ceil(bytes / 1024))

export function fileColumns(
  organizationId: string,
): ServerColumn<ManagedFile>[] {
  return [
    {
      accessorKey: 'filename',
      header: 'Fichier',
      cell: ({ row: { original: file } }) => (
        <div className="flex min-w-0 items-center gap-3">
          {file.state === 'ready' &&
          imageContentTypes.includes(file.content_type) ? (
            <RecordImage
              url={`file:${file.id}`}
              organizationId={organizationId}
              variant="avatar"
            />
          ) : (
            <FileIcon className="size-8 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="max-w-64 truncate font-medium" title={file.filename}>
              {file.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {file.content_type} · {sizeInKb(file.size_bytes)} Ko
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'usage_count',
      header: 'Utilisation',
      cell: ({ row: { original: file } }) => (
        <Badge variant={file.usage_count ? 'secondary' : 'outline'}>
          {file.usage_count ? `${file.usage_count} fiche(s)` : 'Non lié'}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_selectable',
      header: 'Sélection',
      cell: ({ row: { original: file } }) => (
        <Badge variant="outline">
          {file.state !== 'ready'
            ? 'Dépôt en attente'
            : file.is_selectable
              ? 'Disponible'
              : 'Indisponible'}
        </Badge>
      ),
    },
  ]
}

export function FileActions({
  file,
  busy,
  onDownload,
  onRename,
  onToggleAvailability,
  onDelete,
}: {
  file: ManagedFile
  busy: boolean
  onDownload: () => void
  onRename: () => void
  onToggleAvailability: () => void
  onDelete: () => void
}) {
  const ready = file.state === 'ready'
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={busy || !ready}
        aria-label={`Télécharger ${file.filename}`}
        onClick={onDownload}
      >
        <Download />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={busy}
        aria-label={`Renommer ${file.filename}`}
        onClick={onRename}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={busy || !ready}
        aria-label={`${file.is_selectable ? 'Rendre indisponible' : 'Rendre disponible'} ${file.filename}`}
        title={
          file.is_selectable
            ? 'Masquer des sélections, en conservant les liens existants'
            : 'Rendre disponible à la sélection'
        }
        onClick={onToggleAvailability}
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
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  )
}
