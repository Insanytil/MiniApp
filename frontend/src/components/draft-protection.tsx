import { useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useAuth } from '@/features/auth'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'

export function DraftProtection({
  dirty,
  busy,
  description = 'Les modifications non enregistrées seront abandonnées.',
}: {
  dirty: boolean
  busy: boolean
  description?: string
}) {
  const { registerOrganizationChangeGuard, selectOrganization } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const allowChange = useRef(false)
  const saving = useRef(busy)
  saving.current = busy
  useEffect(
    () =>
      registerOrganizationChangeGuard((id) => {
        if (saving.current) {
          toast.add({ title: 'Enregistrement en cours', type: 'loading' })
          return false
        }
        if (!dirty || allowChange.current) return true
        setOrganizationId(id)
        return false
      }),
    [dirty, registerOrganizationChangeGuard],
  )
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => dirty && next.pathname !== '/login',
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const switching = organizationId !== null
  return (
    <AlertDialog
      open={switching || blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) {
          setOrganizationId(null)
          blocker.reset?.()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOrganizationId(null)
              blocker.reset?.()
            }}
          >
            Continuer la configuration
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (organizationId) {
                allowChange.current = true
                selectOrganization(organizationId)
                allowChange.current = false
                setOrganizationId(null)
              } else blocker.proceed?.()
            }}
          >
            Quitter
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
