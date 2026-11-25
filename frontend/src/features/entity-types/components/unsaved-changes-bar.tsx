import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UnsavedChangesBar({
  count,
  disabled,
  saving,
  onDiscard,
  onSave,
}: {
  count: number
  disabled: boolean
  saving: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  const plural = count > 1 ? 's' : ''
  return (
    <div
      className="absolute bottom-3 left-1/2 z-30 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl border bg-background px-4 py-2 shadow-lg sm:rounded-full"
      role="region"
      aria-label="Modifications de configuration"
    >
      <p className="flex items-center gap-2 text-xs" role="status">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
        {count} modification{plural} non enregistrée{plural}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onDiscard}
        >
          Annuler
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={onSave}>
          {saving && <LoaderCircle className="animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
