import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export type LinkFilter = 'all' | 'linked' | 'unlinked'
export type AvailabilityFilter = 'all' | 'available' | 'unavailable'

export function FileFilters({
  linked,
  selectable,
  onLinkedChange,
  onSelectableChange,
}: {
  linked: LinkFilter
  selectable: AvailabilityFilter
  onLinkedChange: (value: LinkFilter) => void
  onSelectableChange: (value: AvailabilityFilter) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-4">
      <div className="space-y-1">
        <Label htmlFor="file-link-filter">Utilisation</Label>
        <NativeSelect
          id="file-link-filter"
          value={linked}
          onChange={(event) => onLinkedChange(event.target.value as LinkFilter)}
        >
          <NativeSelectOption value="all">Tous les fichiers</NativeSelectOption>
          <NativeSelectOption value="linked">
            Liés à une fiche
          </NativeSelectOption>
          <NativeSelectOption value="unlinked">Non liés</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="file-availability-filter">Disponibilité</Label>
        <NativeSelect
          id="file-availability-filter"
          value={selectable}
          onChange={(event) =>
            onSelectableChange(event.target.value as AvailabilityFilter)
          }
        >
          <NativeSelectOption value="all">Toutes</NativeSelectOption>
          <NativeSelectOption value="available">Disponibles</NativeSelectOption>
          <NativeSelectOption value="unavailable">
            Indisponibles
          </NativeSelectOption>
        </NativeSelect>
      </div>
    </div>
  )
}

/** Tri-state filter value as the boolean query parameter expected by the API. */
export const filterFlag = <T extends string>(value: T | 'all', truthy: T) =>
  value === 'all' ? undefined : value === truthy
