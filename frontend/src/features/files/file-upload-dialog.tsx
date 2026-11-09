import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileNameDialog } from './file-name-dialog'
import { filesKey, uploadFile } from './api'
import type { StoredFile } from './api'

export function FileUploadDialog({
  file,
  organizationId,
  onUploaded,
  onClose,
  onBusyChange,
}: {
  file: File
  organizationId: string
  onUploaded?: (file: StoredFile) => void
  onClose: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  return (
    <FileNameDialog
      title="Déposer un fichier"
      initialName={file.name}
      submitLabel="Déposer"
      onClose={onClose}
      onSave={async (name) => {
        const current = new AbortController()
        controller.current = current
        onBusyChange?.(true)
        try {
          const stored = await uploadFile(
            file,
            organizationId,
            current.signal,
            name,
          )
          void client.invalidateQueries({ queryKey: filesKey(organizationId) })
          if (!current.signal.aborted) onUploaded?.(stored)
        } finally {
          controller.current = null
          onBusyChange?.(false)
        }
      }}
    />
  )
}
