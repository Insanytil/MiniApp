import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { errorMessage } from '@/lib/api/client'

export interface AsyncOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface AsyncOptionsResult {
  items: AsyncOption[]
  hasMore?: boolean
}

interface AsyncComboboxProps {
  id: string
  value: AsyncOption | null
  onChange: (option: AsyncOption | null) => void
  onBlur?: () => void
  queryKey: QueryKey
  loadOptions: (
    search: string,
    signal: AbortSignal,
  ) => Promise<AsyncOptionsResult>
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  debounceMs?: number
  maxLength?: number
}

export function AsyncCombobox({
  id,
  value,
  onChange,
  onBlur,
  queryKey,
  loadOptions,
  placeholder = 'Rechercher…',
  emptyMessage = 'Aucun résultat.',
  disabled = false,
  invalid = false,
  describedBy,
  debounceMs = 350,
  maxLength = 255,
}: AsyncComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value?.label ?? '')
  const [search, setSearch] = useState('')
  const selected = useRef(value)
  const term = useDebouncedValue(search.trim(), debounceMs)
  const debouncing = term !== search.trim()
  const query = useQuery({
    queryKey: [...queryKey, term],
    queryFn: ({ signal }) => loadOptions(term, signal),
    enabled: open && !disabled,
    staleTime: 30_000,
  })
  const results = useMemo(
    () => (debouncing || query.isError ? [] : (query.data?.items ?? [])),
    [debouncing, query.isError, query.data],
  )
  // Keep the selected record known even when it is outside the current result window.
  const items = useMemo(
    () =>
      value && !results.some((option) => option.value === value.value)
        ? [value, ...results]
        : results,
    [results, value],
  )
  const busy = debouncing || query.isPending || query.isFetching

  useEffect(() => {
    selected.current = value
    setInputValue(value?.label ?? '')
  }, [value])

  return (
    <Combobox<AsyncOption>
      items={items}
      filteredItems={results}
      value={value}
      inputValue={inputValue}
      open={open && !disabled}
      disabled={disabled}
      autoHighlight
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(option) => {
        selected.current = option
        onChange(option)
        setInputValue(option?.label ?? '')
        setSearch('')
      }}
      onInputValueChange={(text, details) => {
        setInputValue(text)
        if (
          ['input-change', 'input-clear', 'clear-press'].includes(
            details.reason,
          )
        ) {
          setSearch(text)
          if (!text) {
            selected.current = null
            onChange(null)
          }
        }
      }}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          // Free text is not a selection: restore the last explicitly chosen value.
          setInputValue(selected.current?.label ?? '')
          setSearch('')
        }
      }}
    >
      <div className="relative min-w-0">
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          className="h-10 w-full bg-background"
          showTrigger={false}
          showClear={!!value || !!inputValue}
          clearLabel="Effacer la sélection"
          disabled={disabled}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-busy={open && busy}
          onBlur={onBlur}
        />
      </div>
      <ComboboxContent className="min-w-0 max-w-[calc(100vw-2rem)]">
        {query.isError ? (
          <div role="alert" className="space-y-2 p-3 text-sm">
            <p className="text-destructive">{errorMessage(query.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            {busy && (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
              >
                <LoaderCircle
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
                Recherche…
              </div>
            )}
            <ComboboxList>
              {(option: AsyncOption) => (
                <ComboboxItem
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="min-h-10"
                >
                  <div className="min-w-0">
                    <p className="truncate">{option.label}</p>
                    {option.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
            {!busy && !results.length && (
              <p
                role="status"
                className="px-3 py-4 text-sm text-muted-foreground"
              >
                {emptyMessage}
              </p>
            )}
            {!busy && query.data?.hasMore && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Affinez votre recherche pour voir d’autres résultats.
              </p>
            )}
          </>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
