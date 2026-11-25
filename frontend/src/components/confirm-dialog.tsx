import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * A two-button confirmation: dismiss, or confirm the described action.
 *
 * While `pending` (or `disabled`), both buttons are greyed out and the dialog
 * cannot be dismissed; `pending` also shows a spinner and `pendingLabel`.
 * `error` is shown as a destructive alert above the buttons, and `children`
 * render between the description and that alert.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = 'Annuler',
  confirmLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  disabled = false,
  error,
  contentClassName,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  cancelLabel?: string
  confirmLabel: ReactNode
  pendingLabel?: ReactNode
  destructive?: boolean
  pending?: boolean
  disabled?: boolean
  error?: ReactNode
  contentClassName?: string
  onConfirm: () => void | Promise<void>
  children?: ReactNode
}) {
  const locked = pending || disabled
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!locked) onOpenChange(next)
      }}
    >
      <AlertDialogContent
        className={cn(
          // The base content caps at max-w-sm through a data-[size] variant,
          // which a plain sm:max-w-* cannot override: widen it on that variant.
          'max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto data-[size=default]:sm:max-w-md',
          contentClassName,
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter className="sm:flex-wrap sm:justify-between">
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={locked}
            onClick={() => void onConfirm()}
          >
            {pending && (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
