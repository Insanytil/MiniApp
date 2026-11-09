import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ImageFieldInput } from '@/features/files/image-field-input'
import type { FieldDefinition } from '@/features/entity-types/configuration'

export function ScalarInput({
  organizationId,
  onUploadBusy,
  inputId,
  compact = false,
  field,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  organizationId: string
  onUploadBusy: (busy: boolean) => void
  inputId?: string
  compact?: boolean
  field: FieldDefinition
  value: string | string[]
  error?: string
  disabled: boolean
  onChange: (value: string | string[]) => void
  onBlur: () => void
}) {
  const id = inputId ?? `new-record-${field.id}`
  const describedBy = error
    ? `${id}-error`
    : field.kind === 'image'
      ? `${id}-hint`
      : undefined
  const common = {
    id,
    disabled,
    value: typeof value === 'string' ? value : '',
    onBlur,
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {field.name}
        {field.required && (
          <span className="text-muted-foreground"> (obligatoire)</span>
        )}
      </Label>
      {field.kind === 'image' ? (
        <ImageFieldInput
          id={id}
          value={common.value}
          organizationId={organizationId}
          disabled={disabled}
          invalid={!!error}
          describedBy={describedBy}
          onBlur={onBlur}
          onChange={onChange}
          onUploadBusy={onUploadBusy}
        />
      ) : field.kind === 'choice' && field.multiple ? (
        <fieldset
          id={id}
          disabled={disabled}
          aria-label={field.name}
          aria-describedby={describedBy}
          className="max-h-44 space-y-1 overflow-auto rounded-md border p-2"
        >
          {field.options?.map((option) => {
            const selected = Array.isArray(value) ? value : []
            return (
              <label key={option.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onBlur={onBlur}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, option.id]
                        : selected.filter((item) => item !== option.id),
                    )
                  }
                />
                {option.name}
              </label>
            )
          })}
        </fieldset>
      ) : field.kind === 'choice' ? (
        <NativeSelect
          {...common}
          className="w-full"
          onChange={(event) => onChange(event.target.value)}
        >
          <NativeSelectOption value="">Non renseigné</NativeSelectOption>
          {field.options?.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : field.kind === 'boolean' ? (
        <NativeSelect
          {...common}
          className="w-full"
          onChange={(event) => onChange(event.target.value)}
        >
          <NativeSelectOption value="">Non renseigné</NativeSelectOption>
          <NativeSelectOption value="true">Oui</NativeSelectOption>
          <NativeSelectOption value="false">Non</NativeSelectOption>
        </NativeSelect>
      ) : field.kind === 'text' || field.kind === 'address' ? (
        <Textarea
          {...common}
          rows={compact ? 1 : 2}
          className={compact ? 'min-h-9' : undefined}
          maxLength={field.kind === 'address' ? 1000 : 10000}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          {...common}
          inputMode={
            field.kind === 'integer'
              ? 'numeric'
              : field.kind === 'decimal'
                ? 'decimal'
                : undefined
          }
          type={
            field.kind === 'integer' || field.kind === 'decimal'
              ? 'text'
              : field.kind === 'datetime'
                ? 'datetime-local'
                : field.kind === 'date'
                  ? 'date'
                  : field.kind === 'email'
                    ? 'email'
                    : 'tel'
          }
          step={
            field.kind === 'decimal'
              ? 'any'
              : field.kind === 'integer'
                ? '1'
                : undefined
          }
          maxLength={field.kind === 'email' ? 320 : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
