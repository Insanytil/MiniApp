import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { createRecordError, creationSchemaQuery } from '../creation'
import { RecordForm } from './record-form'

export function RecordCreateSheet({
  organizationId,
  entityTypeId,
  recordId,
  onClose,
  onCreated,
}: {
  organizationId: string
  entityTypeId: string
  recordId?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const client = useQueryClient()
  const query = useQuery(
    creationSchemaQuery(organizationId, entityTypeId, recordId),
  )
  const [busy, setBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const reload = async () => {
    await client.fetchQuery({
      ...creationSchemaQuery(organizationId, entityTypeId, recordId),
      staleTime: 0,
    })
    setGeneration((value) => value + 1)
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <SheetContent
        showCloseButton={!busy}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>
            {recordId ? 'Modifier l’enregistrement' : 'Créer un enregistrement'}
          </SheetTitle>
          <SheetDescription>
            {query.data?.name ?? 'Chargement du formulaire…'}
          </SheetDescription>
        </SheetHeader>
        {query.isPending ? (
          <p role="status" className="p-6">
            Chargement…
          </p>
        ) : query.isError && !query.data ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>
                {createRecordError(query.error)}{' '}
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <RecordForm
            key={generation}
            organizationId={organizationId}
            typeId={entityTypeId}
            schema={query.data}
            onClose={onClose}
            onCreated={onCreated}
            onReload={reload}
            onBusyChange={setBusy}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
