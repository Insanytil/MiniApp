import { useId } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { FieldDefinition } from '../configuration'

export function LabeledCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {children}
      </Label>
    </div>
  )
}
function move<T>(items: T[], index: number, offset: number): T[] {
  const next = [...items]
  const other = index + offset
  if (other >= 0 && other < items.length)
    [next[index], next[other]] = [next[other], next[index]]
  return next
}
export function FieldSelection({
  label,
  fields,
  selected,
  onChange,
}: {
  label: string
  fields: FieldDefinition[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-medium">{label}</legend>
      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
        {fields.map((field) => (
          <LabeledCheckbox
            key={field.id}
            checked={selected.includes(field.id)}
            onChange={(checked) =>
              onChange(
                checked
                  ? [...selected, field.id]
                  : selected.filter((id) => id !== field.id),
              )
            }
          >
            {field.name}
          </LabeledCheckbox>
        ))}
      </div>
      {selected.map((id, index) => (
        <div key={id} className="flex items-center gap-2 text-xs">
          <span className="flex-1">
            {index + 1}.{' '}
            {fields.find((field) => field.id === id)?.name ??
              'Champ introuvable'}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Monter le champ"
            disabled={index === 0}
            onClick={() => onChange(move(selected, index, -1))}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Descendre le champ"
            disabled={index === selected.length - 1}
            onClick={() => onChange(move(selected, index, 1))}
          >
            <ArrowDown />
          </Button>
        </div>
      ))}
    </fieldset>
  )
}
