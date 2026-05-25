'use client'

import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchColumn?: string
  searchPlaceholder?: string
  pageSize?: number
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = 'Buscar…',
  pageSize = 20,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    initialState: { pagination: { pageSize } },
    state: { sorting, columnFilters },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {searchColumn && (
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mt-muted)', pointerEvents: 'none' }} />
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
            onChange={e => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
            style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>
      )}

      <div style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden' }}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} style={{ background: 'var(--mt-elevated)', borderBottom: '1px solid var(--mt-border)' }}>
                {hg.headers.map(header => (
                  <TableHead
                    key={header.id}
                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', height: 40 }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', padding: 0 }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  style={{ borderBottom: '1px solid var(--mt-border)', cursor: 'pointer', transition: 'background .1s' }}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} style={{ paddingTop: 12, paddingBottom: 12 }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} style={{ height: 96, textAlign: 'center', fontSize: 13, color: 'var(--mt-muted)' }}>
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <p style={{ fontSize: 13, color: 'var(--mt-text-2)', margin: 0 }}>
            {table.getFilteredRowModel().rows.length} resultado{table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="outline" size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              style={{ height: 32, paddingLeft: 12, paddingRight: 12, fontSize: 12 }}
            >
              <ChevronLeft size={14} style={{ marginRight: 4 }} />
              Anterior
            </Button>
            <span style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>
              Pág. {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button variant="outline" size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              style={{ height: 32, paddingLeft: 12, paddingRight: 12, fontSize: 12 }}
            >
              Siguiente
              <ChevronRight size={14} style={{ marginLeft: 4 }} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { type ColumnDef } from '@tanstack/react-table'
export { cn }
