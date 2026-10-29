import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { organizationError, useOrganizationAction } from '../organizations'
import type { Organization } from '../organizations'

export function OrganizationActionDialog({
  organization,
  action,
  onClose,
  onSaved,
}: {
  organization: Organization
  action: 'delete' | 'status'
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const mutation = useOrganizationAction()
  const label =
    action === 'delete'
      ? 'Supprimer'
      : organization.is_active
        ? 'Suspendre'
        : 'Réactiver'
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{label} l’organisation ?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium break-words text-foreground">
              {organization.name}
            </span>
            <br />
            {action === 'delete'
              ? 'Cette suppression est définitive. Elle est possible uniquement si l’organisation n’a plus de membres.'
              : organization.is_active
                ? 'Les membres ne pourront plus accéder à cet espace tant que l’organisation sera suspendue.'
                : 'Les membres actifs pourront à nouveau accéder à cet espace.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {organizationError(mutation.error, action)}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            variant={action === 'delete' ? 'destructive' : 'default'}
            disabled={mutation.isPending}
            onClick={async () => {
              try {
                await mutation.mutateAsync({ organization, action })
                onSaved(
                  action === 'delete'
                    ? `L’organisation « ${organization.name} » a été supprimée.`
                    : organization.is_active
                      ? `L’organisation « ${organization.name} » a été suspendue.`
                      : `L’organisation « ${organization.name} » a été réactivée.`,
                )
                onClose()
              } catch {
                /* Keep dialog open on failure. */
              }
            }}
          >
            {mutation.isPending && (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {mutation.isPending ? 'Traitement…' : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
