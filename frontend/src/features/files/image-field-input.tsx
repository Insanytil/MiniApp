import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, errorMessage } from '@/lib/api/client'
import { RecordImage } from '@/features/entity-records/components/record-cell'
import { imageFileId } from '@/features/entity-types/presentation'
import { uploadFile } from './api'

const imageTypes = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]

export function ImageFieldInput({
  id,
  value,
  organizationId,
  disabled,
  invalid,
  describedBy,
  onChange,
  onBlur,
  onUploadBusy,
}: {
  id: string
  value: string
  organizationId: string
  disabled: boolean
  invalid: boolean
  describedBy?: string
  onChange: (value: string) => void
  onBlur: () => void
  onUploadBusy: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function deposit(file?: File) {
    if (!file || disabled || controller.current) return
    setError(null)
    if (!imageTypes.includes(file.type)) {
      setError('Choisissez une image PNG, JPEG, GIF, WebP ou AVIF.')
      return
    }
    if (!file.size) {
      setError('Ce fichier est vide.')
      return
    }
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    onUploadBusy(true)
    try {
      const stored = await uploadFile(file, organizationId, current.signal)
      if (!current.signal.aborted) onChange(`file:${stored.id}`)
    } catch (cause) {
      if (!current.signal.aborted)
        setError(
          cause instanceof ApiError && cause.status === 413
            ? 'Cette image dépasse la taille maximale autorisée.'
            : errorMessage(cause),
        )
    } finally {
      controller.current = null
      if (!current.signal.aborted) {
        setBusy(false)
        onUploadBusy(false)
        onBlur()
      }
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (event.dataTransfer.files.length > 1) {
            setError('Déposez une seule image à la fois.')
            return
          }
          void deposit(event.dataTransfer.files[0])
        }}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept={imageTypes.join(',')}
          disabled={disabled || busy}
          aria-invalid={invalid || !!error}
          aria-describedby={error ? `${id}-upload-error` : describedBy}
          onBlur={onBlur}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:text-sm"
          onChange={(event) => {
            void deposit(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Choisissez une image ou glissez-la ici. PNG, JPEG, GIF, WebP ou AVIF.
        </p>
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            Dépôt de l’image…
          </p>
        )}
        {value && (
          <RecordImage
            url={value}
            organizationId={organizationId}
            variant="detail"
          />
        )}
        {value && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <Upload />
              Remplacer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() => {
                onChange('')
                setError(null)
                onBlur()
              }}
            >
              <X />
              Retirer l’image
            </Button>
          </div>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Utiliser une URL d’image
        </summary>
        <Input
          type="url"
          aria-label="URL de l’image"
          placeholder="https://…"
          className="mt-2"
          disabled={disabled || busy}
          value={imageFileId(value) ? '' : value}
          maxLength={2048}
          onBlur={onBlur}
          onChange={(event) => {
            onChange(event.target.value)
            setError(null)
          }}
        />
      </details>
      {error && (
        <p
          id={`${id}-upload-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
