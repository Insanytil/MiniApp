import { useEffect, useState } from 'react'
import type { OnChangeFn, PaginationState } from '@tanstack/react-table'
import type { ListParams } from './server-pagination'

export function useServerList() {
  const [search, setSearch] = useState('')
  const [params, setParams] = useState<ListParams>({
    page: 1,
    pageSize: 20,
    search: '',
  })
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setParams((previous) =>
        previous.search === search.trim()
          ? previous
          : { ...previous, search: search.trim(), page: 1 },
      )
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [search])
  const pagination = { pageIndex: params.page - 1, pageSize: params.pageSize }
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    setParams((previous) => {
      const current = {
        pageIndex: previous.page - 1,
        pageSize: previous.pageSize,
      }
      const next = typeof updater === 'function' ? updater(current) : updater
      return {
        ...previous,
        page: next.pageSize !== previous.pageSize ? 1 : next.pageIndex + 1,
        pageSize: next.pageSize,
      }
    })
  }
  return {
    search,
    setSearch,
    params,
    setParams,
    pagination,
    onPaginationChange,
    isDebouncing: search.trim() !== params.search,
  }
}
