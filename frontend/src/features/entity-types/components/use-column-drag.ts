import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface PointerDrag {
  columnId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
}

type HandleEvent = ReactPointerEvent<HTMLButtonElement>

/**
 * Pointer-driven reordering of `tr[data-column-id]` rows inside a scrollable
 * region, with auto-scroll near its edges.
 */
export function useColumnDrag(
  onDrop: (sourceId: string, targetId: string) => void,
) {
  const region = useRef<HTMLDivElement>(null)
  const drag = useRef<PointerDrag | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const targetAt = (x: number, y: number): string | null => {
    const element = region.current
    if (!element) return null
    const frame = element.getBoundingClientRect()
    const header =
      element.querySelector('thead')?.getBoundingClientRect().bottom ??
      frame.top
    if (x < frame.left || x > frame.right || y < header || y > frame.bottom)
      return null
    const rows = [
      ...element.querySelectorAll<HTMLTableRowElement>('tr[data-column-id]'),
    ]
    return (
      (
        rows.find((row) => row.getBoundingClientRect().bottom >= y) ??
        rows.at(-1)
      )?.dataset.columnId ?? null
    )
  }

  const reset = () => {
    drag.current = null
    setDraggedId(null)
    setOverId(null)
  }

  const finish = (event: HandleEvent, cancel: boolean) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const target =
      !cancel && current.active ? targetAt(event.clientX, event.clientY) : null
    reset()
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (target) onDrop(current.columnId, target)
  }

  const handleProps = (columnId: string) => ({
    onPointerDown: (event: HandleEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = {
        columnId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
      }
    },
    onPointerMove: (event: HandleEvent) => {
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      current.x = event.clientX
      current.y = event.clientY
      if (!current.active) {
        if (
          Math.hypot(
            event.clientX - current.startX,
            event.clientY - current.startY,
          ) < 5
        )
          return
        current.active = true
        setDraggedId(current.columnId)
      }
      event.preventDefault()
      setOverId(targetAt(current.x, current.y))
    },
    onPointerUp: (event: HandleEvent) => finish(event, false),
    onPointerCancel: (event: HandleEvent) => finish(event, true),
    onLostPointerCapture: reset,
  })

  useEffect(() => {
    if (!draggedId) return
    let frame = 0
    const scroll = () => {
      const current = drag.current
      const element = region.current
      if (!current?.active || !element) return
      const bounds = element.getBoundingClientRect()
      if (current.x >= bounds.left && current.x <= bounds.right) {
        if (current.y < bounds.top + 64) element.scrollTop -= 8
        else if (current.y > bounds.bottom - 32) element.scrollTop += 8
        setOverId(targetAt(current.x, current.y))
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [draggedId])

  return { region, draggedId, overId, handleProps }
}
