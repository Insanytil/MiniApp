import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dependentDefinitions } from '../configuration'
import type { ConfiguredEntityType, DisplayProfile } from '../configuration'

function profileSummary(type: ConfiguredEntityType, profile: DisplayProfile) {
  const fields = [...type.available_system_fields, ...type.configuration.fields]
  const title = profile.title_fields
    .map(
      (id) => fields.find((field) => field.id === id)?.name ?? 'Champ absent',
    )
    .join(profile.separator)
  return `${title}${profile.image_field ? ' · Avec avatar' : ''}`
}

export function DisplayProfilesList({
  type,
  catalog,
  busy,
  onAdd,
  onEdit,
  onRemove,
}: {
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  busy: boolean
  onAdd: () => void
  onEdit: (profile: DisplayProfile) => void
  onRemove: (profile: DisplayProfile) => void
}) {
  const profiles = type.configuration.display_profiles
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Composez un titre, un sous-titre et un avatar réutilisables.
        </p>
        <Button size="sm" onClick={onAdd} disabled={busy}>
          <Plus />
          Ajouter
        </Button>
      </div>
      {profiles.map((profile) => {
        const dependencies = dependentDefinitions(profile.id, catalog)
        return (
          <div
            key={profile.id}
            className="flex items-start gap-3 rounded-xl border bg-card p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">
                {profile.name}
                {profile.is_default && (
                  <Badge className="ml-2" variant="secondary">
                    Par défaut
                  </Badge>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground break-words">
                {profileSummary(type, profile)}
              </p>
              {dependencies.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Utilisé par {dependencies.join(', ')}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`Modifier ${profile.name}`}
              onClick={() => onEdit(profile)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy || dependencies.length > 0}
              title={
                dependencies.length
                  ? 'Retirez les références avant de supprimer cette définition.'
                  : undefined
              }
              aria-label={`Supprimer ${profile.name}`}
              onClick={() => onRemove(profile)}
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}
      {!profiles.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune définition pour le moment.
        </div>
      )}
    </>
  )
}
