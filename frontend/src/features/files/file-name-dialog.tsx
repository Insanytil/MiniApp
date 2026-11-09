import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ApiError, errorMessage } from '@/lib/api/client'
import { validFilename } from './policy'

export function FileNameDialog({
  title,
  initialName,
  submitLabel = 'Enregistrer',
  onSave,
  onClose,
}: {
  title: string
  initialName: string
  submitLabel?: string
  onSave: (name: string) => Promise<unknown>
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choisissez un nom pour retrouver facilement ce fichier. Conservez
            son extension.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (busy) return
            if (!validFilename(name)) {
              setError(
                'Saisissez un nom valide de 255 caractères maximum, sans séparateur de chemin.',
              )
              return
            }
            setBusy(true)
            setError(null)
            try {
              await onSave(name.trim())
              onClose()
            } catch (cause) {
              setError(
                cause instanceof ApiError && cause.status === 413
                  ? 'Ce fichier dépasse la taille maximale autorisée.'
                  : errorMessage(cause),
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="file-display-name">Nom du fichier</Label>
            <Input
              id="file-display-name"
              value={name}
              maxLength={255}
              autoFocus
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !validFilename(name)}>
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {busy ? 'Enregistrement…' : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
