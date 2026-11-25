import { ConfirmDialog } from '@/components/confirm-dialog'
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
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`${label} l’organisation ?`}
      description={
        <>
          <span className="font-medium break-words text-foreground">
            {organization.name}
          </span>
          <br />
          {action === 'delete'
            ? 'Cette suppression est définitive. Elle est possible uniquement si l’organisation n’a plus de membres.'
            : organization.is_active
              ? 'Les membres ne pourront plus accéder à cet espace tant que l’organisation sera suspendue.'
              : 'Les membres actifs pourront à nouveau accéder à cet espace.'}
        </>
      }
      error={mutation.isError && organizationError(mutation.error, action)}
      confirmLabel={label}
      pendingLabel="Traitement…"
      destructive={action === 'delete'}
      pending={mutation.isPending}
      onConfirm={async () => {
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
    />
  )
}
