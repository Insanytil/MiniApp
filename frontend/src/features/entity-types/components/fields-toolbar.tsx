import { useId } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { fieldKinds } from '../configuration'
import type { FieldFilters } from '../fields-order'

export function FieldsToolbar({
  filters,
  onFiltersChange,
  filtered,
  visibleCount,
  totalCount,
  busy,
  onAdd,
}: {
  filters: FieldFilters
  onFiltersChange: (filters: FieldFilters) => void
  filtered: boolean
  visibleCount: number
  totalCount: number
  busy: boolean
  onAdd: () => void
}) {
  const id = useId()
  const set = (patch: Partial<FieldFilters>) =>
    onFiltersChange({ ...filters, ...patch })

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1 sm:max-w-sm">
        <Label htmlFor={`${id}-search`} className="sr-only">
          Rechercher un champ
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={`${id}-search`}
          value={filters.search}
          disabled={busy}
          maxLength={255}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Rechercher un champ…"
          className="h-9 bg-background pr-9 pl-9"
        />
        {filters.search && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1 right-1"
            aria-label="Effacer la recherche de champs"
            onClick={() => set({ search: '' })}
          >
            <X />
          </Button>
        )}
      </div>
      <Label htmlFor={`${id}-kind`} className="sr-only">
        Filtrer les champs par type
      </Label>
      <NativeSelect
        id={`${id}-kind`}
        value={filters.kind}
        disabled={busy}
        onChange={(e) => set({ kind: e.target.value })}
      >
        <NativeSelectOption value="">Type · Tous</NativeSelectOption>
        {Object.entries(fieldKinds).map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Label htmlFor={`${id}-required`} className="sr-only">
        Filtrer les champs par obligation
      </Label>
      <NativeSelect
        id={`${id}-required`}
        value={filters.required}
        disabled={busy}
        onChange={(e) =>
          set({ required: e.target.value as FieldFilters['required'] })
        }
      >
        <NativeSelectOption value="">Requis · Tous</NativeSelectOption>
        <NativeSelectOption value="required">Requis</NativeSelectOption>
        <NativeSelectOption value="optional">Optionnels</NativeSelectOption>
      </NativeSelect>
      <p role="status" className="px-1 text-xs text-muted-foreground">
        {filtered ? `${visibleCount} sur ${totalCount}` : totalCount} champ
        {totalCount > 1 ? 's' : ''}
      </p>
      <Button
        type="button"
        size="sm"
        className="ml-auto"
        disabled={busy}
        onClick={onAdd}
      >
        <Plus /> Ajouter un champ
      </Button>
    </div>
  )
}
