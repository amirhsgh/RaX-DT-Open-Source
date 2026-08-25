import * as React from 'react';
import { cn } from '../../utils/cn';

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn(
        'w-full caption-bottom text-sm text-foreground',
        className
      )}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('bg-muted/40 [&_tr]:border-b [&_tr]:border-border', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
      className
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'table-row-interactive border-b border-border text-foreground odd:bg-muted/10 even:bg-card/40',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-4 align-middle text-sm text-foreground [&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

// Ant Design compatible Table wrapper
const AntTable = React.forwardRef(({
  columns = [],
  dataSource = [],
  rowKey = 'key',
  loading = false,
  pagination,
  scroll,
  size,
  onRow,
  className,
  children,
  ...props
}, ref) => {
  const getRowKey = (record, index) => {
    if (typeof rowKey === 'function') {
      return rowKey(record, index);
    }
    return record[rowKey] || index;
  };

  const hasChildTable = React.Children.count(children) > 0;

  if (hasChildTable) {
    return (
      <div className={cn('w-full', className)} ref={ref} {...props}>
        <div className="relative w-full overflow-auto" style={scroll}>
          <table
            className={cn(
              'w-full caption-bottom text-sm text-foreground',
              size === 'small' && 'text-xs'
            )}
          >
            {children}
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} ref={ref} {...props}>
      {loading && <div className="text-center py-4">Loading...</div>}
      {!loading && (
        <div className="relative w-full overflow-auto" style={scroll}>
          <table
            className={cn(
              'w-full caption-bottom text-sm text-foreground',
              size === 'small' && 'text-xs'
            )}
          >
            <thead className="[&_tr]:border-b [&_tr]:border-border bg-muted/40">
              <tr className="border-b border-border">
                {columns.map((column, index) => (
                  <th
                    key={column.key || index}
                    className="h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ width: column.width }}
                  >
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {dataSource.map((record, rowIndex) => {
                const rowProps = onRow ? onRow(record, rowIndex) : {};
                return (
                  <tr
                    key={getRowKey(record, rowIndex)}
                    className={cn(
                      'table-row-interactive border-b border-border text-foreground odd:bg-muted/10 even:bg-card/40',
                      rowProps.className
                    )}
                    {...rowProps}
                  >
                    {columns.map((column, colIndex) => (
                      <td
                        key={column.key || colIndex}
                        className="p-4 align-middle text-sm text-foreground"
                        style={{ width: column.width }}
                      >
                        {column.render
                          ? column.render(record[column.dataIndex], record, rowIndex)
                          : record[column.dataIndex]
                        }
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pagination && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="text-sm text-muted-foreground">
            {pagination.showTotal && pagination.showTotal(dataSource.length)}
          </div>
        </div>
      )}
    </div>
  );
});
AntTable.displayName = 'AntTable';

// Override default Table export with Ant-compatible version
const TableWithAntSupport = Object.assign(AntTable, {
  Header: TableHeader,
  Body: TableBody,
  Footer: TableFooter,
  Head: TableHead,
  Row: TableRow,
  Cell: TableCell,
  Caption: TableCaption,
});

export {
  TableWithAntSupport as Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
