import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

/** Usage count of a definition, listing the referencing definitions. */
export function DependenciesPopover({
  dependencies,
  name,
  title,
  description,
  emptyLabel,
}: {
  dependencies: string[]
  name: string
  title: ReactNode
  description?: ReactNode
  emptyLabel: string
}) {
  if (!dependencies.length)
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="rounded-full font-normal"
            aria-label={`Voir les utilisations de ${name}`}
          />
        }
      >
        {dependencies.length} utilisation
        {dependencies.length > 1 ? 's' : ''}
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverTitle>{title}</PopoverTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        <ul className="space-y-1 text-xs text-muted-foreground">
          {dependencies.map((entry, i) => (
            <li key={`${entry}-${i}`}>{entry}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
