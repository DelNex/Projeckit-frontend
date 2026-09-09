import * as React from "react"
import { useReactTable } from "@tanstack/react-table"
import { cn } from "@/lib/utils"

interface DataTableProps<TData> {
  data: TData[]
  columns: React.TableColumnDef<TData>[]
  className?: string
  selection?
} // eslint-disable-next-line react/export-arrow-functions

export function DataTable<TData>(
  props: DataTableProps<TData>,
) {
  const {
    data,
    columns,
    className,
    ...rest
  } = props

  const table = useReactTable({
    data,
    columns,
    state: {
      pagination: {
        pageSize: 10,
      },
    },
    ...rest,
  })

  return (
    <div className={cn(
      "w-full rounded border bg-card border-border overflow-hidden",
      className,
    )}>
      <div className="flex items-center justify-between p-4 border-b bg-muted/50">
        <span className="text-sm font-medium text-foreground">
          {data.length > 0 && `${data.length} items`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr
                key={headerGroup.id}
                className="border-b bg-muted/50"
              >
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className={cn(
                      "p-3 text-left text-xs font-medium capitalize text-muted-foreground",
                      "hover:bg-muted/20",
                    )}
                  >
                    {header.isSorted
                      ? <>
                        {header.column.columnDef.sortInfo?.isSorted ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3.5 w-3.5 fill-current"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.06 3.5a.5.5 0 0 1 .63.305l7.36 5.25a.5.5 0 0 1-.406 1.22l-7.36 5.25a.5.5 0 0 1-.79-.608l7.19-5.48a.5.5 0 0 1 .32-.308l-7.19-5.48a.5.5 0 0 1 0-.998z" />
                            <path d="M7.06 5.5a.5.5 0 0 1 .63.305l7.36 5.25a.5.5 0 0 1-.406 1.22l-7.36 5.25a.5.5 0 0 1-.79-.608l7.19-5.48a.5.5 0 0 1 .32-.308l-7.19-5.48a.5.5 0 0 1 0-.998z" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3.5 w-3.5 fill-current"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10.97 4.97a.5.5 0 0 1 .5 .728l-7.25 5.333a.5.5 0 0 1-.707-.708l7.25-5.333a.5.5 0 0 1 .5-.728zM10 16a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5zm-.75-5.4a.5.5 0 0 1-.25-.44l1.5-1.088a.5.5 0 0 1-.05-.028l-1.5-.995a.5.5 0 0 1-.05-.028l1.5-1.088a.5.5 0 0 1-.25-.44l-1.5 1.088a.5.5 0 0 1-.68.182l1.365 2.08a.5.5 0 0 1-.358.312l-1.75.5a.5.5 0 0 1-.76 1.087l-1.4 1.85a.5.5 0 0 1-.678.37l1.5-1.088a.5.5 0 0 1-.05-.028l-1.5.995a.5.5 0 0 1-.05.028l1.5 1.088a.5.5 0 0 1-.25.44l1.5 1.088a.5.5 0 0 1 .68.182l-1.365 2.08a.5.5 0 0 1 .358.312l1.75-.5a.5.5 0 0 1 .76-1.087l1.4-1.85a.5.5 0 0 1 .678-.37l-1.5 1.088a.5.5 0 0 1 .05.028l1.5-.995a.5.5 0 0 1 .05-.028l-1.5.995a.5.5 0 0 1 .05.028l1.5-.995a.5.5 0 0 1 .25.44z" />
                          </svg>
                        )}
                      {header.isSorted ? (
                        <span className="ms-1">
                          {header.column.columnDef.sortInfo?.isSorted ? "▼" : "▲"}
                        </span>
                      ) : null}
                      </span>
                    }
                    <span>{header.column.accessorKey}</span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => {
              const { row } = row
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/20",
                    row.getIsSelected() && "bg-muted/30",
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className={cn(
                        "p-3 whitespace-nowrap",
                        cell.isSorted && "font-medium",
                      )}
                    >
                      {cell.column.columnDef.accessorFn
                        ? cell.column.columnDef.accessorFn(row.original)
                        : cell.renderedValue}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="p-4 bg-muted/50 text-sm">
        <div className="flex justify-between">
          <span>
            Page {table.getPageIndex() + 1} of {table.getPageCount()}
          </span>
          <span>
            {table.state().pagination.pageSize} per page
          </span>
        </div>
      </div>
    </div>
  )
}