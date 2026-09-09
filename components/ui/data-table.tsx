"use client"

import { cn } from "@/lib/utils"
import {
  createPaginatedRowModel,
  flexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"

interface DataTableProps {
  data: any[]
  columns: any[]
  className?: string
}

const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

export function DataTable({
  data,
  columns,
  className,
}: DataTableProps) {
  const table = useTable({
    features,
    data,
    columns,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  })

  const pagination = table.state.pagination
  const rows = table.getRowModel().rows

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b bg-muted/50 p-4">
        <span className="text-sm font-medium text-foreground">
          {data.length > 0 ? `${data.length} items` : "No items"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b bg-muted/50"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="p-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/20"
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="whitespace-nowrap p-3"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/50 p-4 text-sm">
        <span>
          Page {pagination.pageIndex + 1} of{" "}
          {Math.max(table.getPageCount(), 1)}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>

          <select
            value={pagination.pageSize}
            onChange={(event) => {
              table.setPageSize(Number(event.target.value))
            }}
            className="rounded border bg-background px-2 py-1.5"
            aria-label="Rows per page"
          >
            {[10, 20, 30, 50].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

