import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ChoiceBadges } from '@/features/entity-types/components/choice-badges'
import { RecordImage } from '@/features/files/record-image'
import { errorMessage } from '@/lib/api/client'
import { recordDetailQuery, formatValue } from '../records'
import type { RecordDetail } from '../records'

export function DetailSheet({
  organizationId,
  entityTypeId,
  recordId,
  onClose,
}: {
  organizationId: string
  entityTypeId: string
  recordId: string
  onClose: () => void
}) {
  const query = useQuery(
    recordDetailQuery(organizationId, entityTypeId, recordId),
  )
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>Détails de l’enregistrement</SheetTitle>
          <SheetDescription>
            {query.data?.entity_type_name ?? recordId}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {query.isPending ? (
            <p role="status">Chargement…</p>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {errorMessage(query.error)}{' '}
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              <dl className="space-y-5">
                {query.data.fields
                  .filter((field) => !field.system)
                  .map((field) => (
                    <DetailField
                      key={field.id}
                      field={field}
                      organizationId={organizationId}
                    />
                  ))}
              </dl>
              {query.data.fields.some((field) => field.system) && (
                <details
                  key={recordId}
                  className="group rounded-lg border bg-muted/20"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    Informations de suivi
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <dl className="space-y-4 border-t px-4 py-4">
                    {query.data.fields
                      .filter((field) => field.system)
                      .map((field) => (
                        <DetailField
                          key={field.id}
                          field={field}
                          organizationId={organizationId}
                        />
                      ))}
                  </dl>
                </details>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailField({
  field,
  organizationId,
}: {
  field: RecordDetail['fields'][number]
  organizationId: string
}) {
  return (
    <div>
      <dt className="mb-1 text-xs text-muted-foreground">{field.name}</dt>
      <dd className="text-sm whitespace-pre-wrap break-words">
        {field.choice_options ? (
          <ChoiceBadges options={field.choice_options} />
        ) : field.kind === 'image' ? (
          <RecordImage
            variant="detail"
            organizationId={organizationId}
            url={typeof field.value === 'string' ? field.value : null}
          />
        ) : (
          formatValue(field.display_value ?? field.value, field.kind)
        )}
      </dd>
    </div>
  )
}
