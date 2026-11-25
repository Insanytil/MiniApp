import { useId } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type {
  ConfiguredEntityType,
  DisplayProfile,
  ViewColumn,
} from '../configuration'
import {
  choiceFor,
  pathFor,
  profileTargetFor,
  selectedProfile,
} from '../view-column-choices'
import type { ColumnContext } from '../view-column-choices'

/** Presentation settings of a non-field column; its content is fixed. */
export function ViewColumnDisplayDialog({
  context,
  column,
  canEditProfiles,
  onUpdate,
  onEditProfile,
  onClose,
}: {
  context: ColumnContext
  column: ViewColumn
  canEditProfiles: boolean
  onUpdate: (patch: Partial<ViewColumn>) => void
  onEditProfile: (
    target: ConfiguredEntityType,
    profile?: DisplayProfile,
  ) => void
  onClose: () => void
}) {
  const id = useId()
  const path = pathFor(context, column)
  const target = profileTargetFor(context, column)
  const profile = selectedProfile(target, column)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Affichage de {column.label}</DialogTitle>
          <DialogDescription>
            Configurez la présentation de cette colonne. Son contenu est fixé
            lors de l’ajout.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-1">
          <p className="rounded-lg bg-muted p-3 text-sm">
            {choiceFor(context, column)?.label}
          </p>
          {(column.kind === 'relation' || column.kind === 'count') && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-relation-display`}>Afficher</Label>
              <NativeSelect
                id={`${id}-relation-display`}
                className="w-full"
                value={column.kind}
                onChange={(event) =>
                  onUpdate({
                    kind: event.target.value as 'relation' | 'count',
                    profile_id: null,
                  })
                }
              >
                <NativeSelectOption value="relation">
                  Les éléments liés
                </NativeSelectOption>
                <NativeSelectOption value="count">
                  Le nombre d’éléments liés
                </NativeSelectOption>
              </NativeSelect>
            </div>
          )}
          {(column.kind === 'relation' || column.kind === 'display') && (
            <>
              <div className="space-y-1">
                <Label htmlFor={`${id}-profile`}>Profil d’affichage</Label>
                <NativeSelect
                  id={`${id}-profile`}
                  className="w-full"
                  value={column.profile_id ?? ''}
                  onChange={(event) =>
                    onUpdate({ profile_id: event.target.value || null })
                  }
                >
                  <NativeSelectOption value="">
                    Affichage par défaut de chaque type lié
                  </NativeSelectOption>
                  {target?.configuration.display_profiles.map((entry) => (
                    <NativeSelectOption key={entry.id} value={entry.id}>
                      {entry.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {target && canEditProfiles && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          target.configuration.display_profiles.length >= 50
                        }
                        onClick={() => onEditProfile(target)}
                      >
                        <Plus />
                        Créer un profil sur {target.name}
                      </Button>
                      {profile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditProfile(target, profile)}
                        >
                          <Pencil />
                          Modifier « {profile.name} »
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Un profil combine les champs de {target.name} : titre,
                      sous-titre et image. Il est réutilisable dans les autres
                      vues.
                    </p>
                  </div>
                )}
                {!target && path && (
                  <p className="text-xs text-muted-foreground">
                    Cette relation accepte plusieurs types. Chaque type lié
                    utilise son propre profil par défaut.
                  </p>
                )}
              </div>
              {path?.many && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-collection`}>
                    Présentation de la collection
                  </Label>
                  <NativeSelect
                    id={`${id}-collection`}
                    value={column.collection_display}
                    onChange={(event) =>
                      onUpdate({
                        collection_display: event.target.value as
                          'list' | 'first',
                      })
                    }
                  >
                    <NativeSelectOption value="list">
                      Liste compacte
                    </NativeSelectOption>
                    <NativeSelectOption value="first">
                      Premier élément et compteur des autres
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Terminé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
