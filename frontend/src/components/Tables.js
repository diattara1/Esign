import React from 'react';

const Table = ({
  columns,
  data,
  title,
  description,
  loading = false,
  emptyMessage = 'Aucune donnée disponible',
  containerClassName = '',
  tableClassName = '',
  headerClassName = '',
  rowClassName = '',
}) => {
  if (loading) {
    return (
      <div className="space-y-4">
        {title && <TableHeader title={title} description={description} />}
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        {title && <TableHeader title={title} description={description} />}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && <TableHeader title={title} description={description} />}
      <div className={` ${containerClassName}`}>
        <table className={`min-w-full divide-y divide-gray-200 ${tableClassName}`}>
          <thead className={`bg-gray-50 ${headerClassName}`}>
            <tr>
              {columns.map((col, index) => (
                <th
                  key={`th-${index}`}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider ${col.headerClassName || ''}`}
                >
                  {col.Header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, rowIndex) => (
              <tr 
                key={row.id || `row-${rowIndex}`} 
                className={typeof rowClassName === 'function' 
                  ? rowClassName(row, rowIndex) 
                  : rowClassName || 'hover:bg-gray-50'
                }
              >
                {columns.map((col, colIndex) => (
                  <td
                    key={`td-${rowIndex}-${colIndex}`}
                    className={`px-6 py-4 ${col.cellClassName || 'text-gray-700'}`}
                  >
                    {col.Cell ? col.Cell({ value: row[col.accessor], row, index: rowIndex }) : (row[col.accessor] || '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TableHeader = ({ title, description }) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
  </div>
);

export default Table;