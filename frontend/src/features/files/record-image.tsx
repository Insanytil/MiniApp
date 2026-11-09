import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { getFileDownload } from './api'
import { imageFileId, safeImageUrl } from '@/features/entity-types/presentation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function RecordImage({
  url,
  initials = '',
  variant = 'table',
  organizationId,
}: {
  url: string | null
  organizationId?: string
  initials?: string
  variant?: 'table' | 'detail' | 'avatar'
}) {
  const { organization } = useAuth()
  const scopeId = organizationId ?? organization?.id
  const fileId = imageFileId(url)
  const signed = useQuery({
    queryKey: ['organization', scopeId, 'file-preview', fileId],
    enabled: !!fileId && !!scopeId,
    queryFn: () => getFileDownload(fileId!, scopeId!, true),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data
        ? Math.max(1000, query.state.data.expires_in * 800)
        : false,
    retry: false,
  })
  const safe = fileId ? (signed.data?.url ?? null) : safeImageUrl(url)
  const [failed, setFailed] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const available = !!safe && safe !== failed
  const frame =
    variant === 'detail'
      ? 'flex h-64 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 sm:h-80'
      : variant === 'avatar'
        ? 'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium'
        : 'flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-xs'
  if (!available) return <span className={frame}>{initials || '—'}</span>
  return (
    <>
      <button
        type="button"
        className={`${frame} cursor-zoom-in transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2`}
        aria-label="Agrandir l’image"
        onClick={() => setExpanded(true)}
      >
        <img
          src={safe}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className={`size-full ${variant === 'avatar' ? 'object-cover' : 'object-contain p-1'}`}
          onError={() => setFailed(safe)}
        />
      </button>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu de l’image</DialogTitle>
          </DialogHeader>
          <img
            src={safe}
            alt="Image de l’enregistrement"
            referrerPolicy="no-referrer"
            className="max-h-[75dvh] w-full rounded-lg object-contain"
            onError={() => setFailed(safe)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
