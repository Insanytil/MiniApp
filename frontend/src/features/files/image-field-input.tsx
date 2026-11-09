import { useRef, useState } from 'react'
import { Upload, X, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RecordImage } from '@/features/files/record-image'
import { imageFileId } from '@/features/entity-types/presentation'
import { FilePicker } from './file-picker'
import { FileUploadDialog } from './file-upload-dialog'

import { imageContentTypes } from './policy'

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
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  function deposit(file?: File) {
    if (!file || disabled || busy) return
    setError(null)
    if (!imageContentTypes.includes(file.type)) {
      setError('Choisissez une image PNG, JPEG, GIF, WebP ou AVIF.')
      return
    }
    if (!file.size) {
      setError('Ce fichier est vide.')
      return
    }
    setPendingFile(file)
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
          accept={imageContentTypes.join(',')}
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
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => setPicking(true)}
      >
        <Images />
        Choisir une image existante
      </Button>
      {picking && !disabled && !busy && (
        <FilePicker
          key={organizationId}
          organizationId={organizationId}
          imagesOnly
          selectedId={imageFileId(value)}
          onClose={() => setPicking(false)}
          onSelect={(file) => {
            onChange(`file:${file.id}`)
            setError(null)
            setPicking(false)
            onBlur()
          }}
        />
      )}
      {pendingFile && (
        <FileUploadDialog
          file={pendingFile}
          organizationId={organizationId}
          onClose={() => setPendingFile(null)}
          onBusyChange={(uploadBusy) => {
            setBusy(uploadBusy)
            onUploadBusy(uploadBusy)
          }}
          onUploaded={(stored) => {
            onChange(`file:${stored.id}`)
            setError(null)
            onBlur()
          }}
        />
      )}
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
