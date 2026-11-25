import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { columnChoiceGroups, searchChoices } from '../view-column-choices'
import type { ColumnChoice } from '../view-column-choices'

/** Mount only while open so search and selection start fresh each time. */
export function AddViewColumnsDialog({
  choices,
  presentKeys,
  remaining,
  onAdd,
  onClose,
}: {
  choices: ColumnChoice[]
  presentKeys: Set<string>
  remaining: number
  onAdd: (choices: ColumnChoice[]) => void
  onClose: () => void
}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const visibleChoices = searchChoices(choices, search)
  const availableChoices = visibleChoices.filter(
    (choice) => !presentKeys.has(choice.key),
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter des colonnes</DialogTitle>
          <DialogDescription>
            Choisissez les champs et les relations à afficher. Chaque colonne ne
            peut être ajoutée qu’une fois.
          </DialogDescription>
        </DialogHeader>
        <Label className="sr-only" htmlFor={`${id}-add-search`}>
          Rechercher une colonne à ajouter
        </Label>
        <Input
          id={`${id}-add-search`}
          value={search}
          maxLength={255}
          placeholder="Rechercher un champ ou une relation…"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selectedKeys.length} sélectionnée(s) · {remaining} place(s)
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!availableChoices.length}
            onClick={() =>
              setSelectedKeys(
                availableChoices
                  .slice(0, remaining)
                  .map((choice) => choice.key),
              )
            }
          >
            Sélectionner les disponibles
          </Button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto rounded-lg border p-3">
          {columnChoiceGroups.map((group) => {
            const items = visibleChoices.filter(
              (choice) => choice.group === group,
            )
            return items.length ? (
              <section key={group}>
                <h4 className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                  {group}
                </h4>
                {items.map((choice) => {
                  const present = presentKeys.has(choice.key)
                  const selected = selectedKeys.includes(choice.key)
                  return (
                    <label
                      key={choice.key}
                      className={`flex items-center gap-3 rounded-lg p-2 ${present ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-muted'}`}
                    >
                      <Checkbox
                        checked={present || selected}
                        disabled={
                          present ||
                          (!selected && selectedKeys.length >= remaining)
                        }
                        onCheckedChange={(checked) =>
                          setSelectedKeys((previous) =>
                            checked
                              ? [...previous, choice.key]
                              : previous.filter((key) => key !== choice.key),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        {choice.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {present ? 'Déjà ajoutée' : choice.detail}
                      </span>
                    </label>
                  )
                })}
              </section>
            ) : null
          })}
          {!visibleChoices.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Aucune colonne ne correspond à cette recherche.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!selectedKeys.length}
            onClick={() => {
              onAdd(
                choices
                  .filter(
                    (choice) =>
                      selectedKeys.includes(choice.key) &&
                      !presentKeys.has(choice.key),
                  )
                  .slice(0, remaining),
              )
              onClose()
            }}
          >
            Ajouter {selectedKeys.length} colonne
            {selectedKeys.length > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
