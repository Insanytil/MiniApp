import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AsyncCombobox } from '@/components/inputs/async-combobox'
import type { AsyncOption } from '@/components/inputs/async-combobox'
import { recordOptions } from '../creation'
import type { CreationRelation } from '../creation'
import { recordsKey } from '../records'

export function RelationInput({
  inputId,
  compact = false,
  organizationId,
  typeId,
  recordId,
  limit,
  relation,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  organizationId: string
  typeId: string
  recordId?: string
  inputId?: string
  compact?: boolean
  limit: number
  relation: CreationRelation
  value: AsyncOption[]
  error?: string
  disabled: boolean
  onChange: (value: AsyncOption[]) => void
  onBlur: () => void
}) {
  const id = inputId ?? `new-record-${relation.id}-${relation.direction}`
  const selectedIds = value.map((item) => item.value)
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {relation.name}
        {relation.required && (
          <span className="text-muted-foreground"> (obligatoire)</span>
        )}
      </Label>
      <AsyncCombobox
        key={relation.many ? selectedIds.join('|') : 'single'}
        id={id}
        value={relation.many ? null : (value[0] ?? null)}
        disabled={disabled || (relation.many && value.length >= limit)}
        invalid={!!error}
        describedBy={error ? `${id}-error` : `${id}-hint`}
        onBlur={onBlur}
        queryKey={[
          ...recordsKey(organizationId, typeId),
          'record-options',
          recordId ?? null,
          relation.id,
          relation.direction,
          relation.many ? selectedIds : [],
        ]}
        loadOptions={async (search, signal) => {
          const result = await recordOptions(
            organizationId,
            typeId,
            relation,
            search,
            signal,
            recordId,
          )
          return {
            ...result,
            items: result.items.map((item) => ({
              ...item,
              disabled: relation.many && selectedIds.includes(item.value),
            })),
          }
        }}
        onChange={(option) =>
          onChange(
            relation.many
              ? option
                ? [...value, option]
                : value
              : option
                ? [option]
                : [],
          )
        }
        placeholder="Rechercher un enregistrement…"
        emptyMessage="Aucun enregistrement disponible. Créez d’abord un élément lié ou affinez la recherche."
      />
      {relation.many && value.length > 0 && (
        <ul className="space-y-1">
          {value.map((item) => (
            <li
              key={item.value}
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1"
            >
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={item.label}
              >
                {item.label}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Retirer ${item.label}`}
                onClick={() =>
                  onChange(
                    value.filter((selected) => selected.value !== item.value),
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p
        id={`${id}-hint`}
        className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}
      >
        {relation.many
          ? 'Plusieurs éléments peuvent être sélectionnés.'
          : 'Un seul élément peut être sélectionné.'}{' '}
        Les éléments déjà affectés sont exclus si la relation l’exige.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
