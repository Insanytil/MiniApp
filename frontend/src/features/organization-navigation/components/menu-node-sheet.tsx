import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  entries,
  insertNode,
  moveNode,
  replaceNode,
  validateMenu,
} from '../navigation'
import type { MenuNode, MenuResponse } from '../navigation'
import { MenuIconPicker } from './menu-icon'

export function MenuNodeSheet({
  nodes,
  item,
  types,
  onSave,
  onClose,
}: {
  nodes: MenuNode[]
  item?: MenuNode
  types: MenuResponse['entity_types']
  onSave: (nodes: MenuNode[]) => void
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const flat = entries(nodes)
  const originalParent = item
    ? (flat.find(({ node }) => node.id === item.id)?.parentId ?? null)
    : null
  const descendants =
    item?.kind === 'category'
      ? entries(item.children).map(({ node }) => node.id)
      : []
  const parents = flat.filter(
    ({ node }) =>
      node.kind === 'category' &&
      node.id !== item?.id &&
      !descendants.includes(node.id),
  )
  const form = useForm({
    defaultValues: {
      kind: item?.kind ?? 'category',
      label: item?.label ?? '',
      icon: item?.icon ?? '',
      entityTypeId:
        item?.kind === 'entity' ? item.entity_type_id : (types[0]?.id ?? ''),
      parentId: originalParent ?? '',
    },
    onSubmit: ({ value }) => {
      if (value.kind === 'category' && !value.label.trim()) {
        setError('Le nom de la catégorie est obligatoire.')
        return
      }
      if (value.label.length > 100) {
        setError('100 caractères maximum pour le libellé.')
        return
      }
      if (value.kind === 'entity' && !value.entityTypeId) {
        setError('Sélectionnez un type d’entité.')
        return
      }
      const identity = item?.id ?? crypto.randomUUID()
      const updated: MenuNode =
        value.kind === 'category'
          ? {
              id: identity,
              kind: 'category',
              label: value.label.trim(),
              icon: value.icon || null,
              children: item?.kind === 'category' ? item.children : [],
            }
          : {
              id: identity,
              kind: 'entity',
              entity_type_id: value.entityTypeId,
              label: value.label.trim() || null,
              icon: value.icon || null,
            }
      try {
        let next = item
          ? replaceNode(nodes, updated)
          : insertNode(nodes, value.parentId || null, updated)
        if (item && (value.parentId || null) !== originalParent)
          next = moveNode(next, identity, value.parentId || null)
        validateMenu(
          next,
          types.map((type) => type.id),
        )
        onSave(next)
        onClose()
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : 'Déplacement impossible.',
        )
      }
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>{item ? 'Modifier' : 'Ajouter'} un élément</SheetTitle>
          <SheetDescription>
            Les modifications seront appliquées avec « Enregistrer le menu ».
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <form.Field name="kind">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="menu-node-kind">Type d’élément</Label>
                  <NativeSelect
                    id="menu-node-kind"
                    value={field.state.value}
                    disabled={!!item}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as 'category' | 'entity',
                      )
                    }
                  >
                    <NativeSelectOption value="category">
                      Catégorie
                    </NativeSelectOption>
                    <NativeSelectOption value="entity">
                      Type d’entité
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.kind}>
              {(kind) => (
                <>
                  {kind === 'entity' && (
                    <form.Field name="entityTypeId">
                      {(field) => (
                        <div className="space-y-2">
                          <Label htmlFor="menu-entity-type">
                            Type d’entité
                          </Label>
                          <NativeSelect
                            id="menu-entity-type"
                            className="w-full"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                          >
                            <NativeSelectOption value="">
                              Choisir un type
                            </NativeSelectOption>
                            {types.map((type) => (
                              <NativeSelectOption key={type.id} value={type.id}>
                                {type.name} ({type.technical_name})
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          {!types.length && (
                            <p className="text-xs text-muted-foreground">
                              Créez d’abord un type d’entité depuis
                              Configuration.
                            </p>
                          )}
                        </div>
                      )}
                    </form.Field>
                  )}
                  <form.Field name="label">
                    {(field) => (
                      <div className="space-y-2">
                        <Label htmlFor="menu-node-label">
                          {kind === 'category'
                            ? 'Nom de la catégorie'
                            : 'Libellé personnalisé (facultatif)'}
                        </Label>
                        <Input
                          id="menu-node-label"
                          maxLength={100}
                          autoFocus
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                        {kind === 'entity' && (
                          <p className="text-xs text-muted-foreground">
                            Vide : le nom du type sera utilisé, même après un
                            renommage.
                          </p>
                        )}
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="icon">
                    {(field) => (
                      <MenuIconPicker
                        value={field.state.value}
                        kind={kind}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.Field>
                </>
              )}
            </form.Subscribe>
            <form.Field name="parentId">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="menu-node-parent">Emplacement</Label>
                  <NativeSelect
                    id="menu-node-parent"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    <NativeSelectOption value="">
                      Racine du menu
                    </NativeSelectOption>
                    {parents.map(({ node, depth }) => (
                      <NativeSelectOption key={node.id} value={node.id}>
                        {'— '.repeat(depth)}
                        {node.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </form.Field>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter className="mt-0 shrink-0 border-t p-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">Appliquer au brouillon</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
