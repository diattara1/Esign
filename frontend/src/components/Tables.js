// Table.jsx
import React, { useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import useIsMobile, { MOBILE_BREAKPOINT } from '../hooks/useIsMobile';

const Table = ({
  columns,
  data,
  title,
  description,
  loading = false,
  emptyMessage = 'Aucune donnée disponible',
  emptyState = null,
  containerClassName = '',
  tableClassName = '',
  headerClassName = '',
  rowClassName = '',
  itemsPerPage = 10,
  maxWidth = 768,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const isMobile = useIsMobile(MOBILE_BREAKPOINT);


  // Pagination
  const totalItems = data?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentData = data?.slice(startIndex, endIndex) || [];

  const goToPage = (page) => {
    const safe = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(safe);
  };

  // Loading
  if (loading) {
    return (
      <div className="space-y-4">
        {title && <TableHeader title={title} description={description} />}
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  // Vide
  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        {title && <TableHeader title={title} description={description} />}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {emptyState ? (
            emptyState
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500">{emptyMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Vue mobile : cartes
  if (isMobile) {
    return (
      <div className="space-y-4">
        {title && <TableHeader title={title} description={description} />}

        <div className="space-y-3">
          {currentData.map((row, rowIndex) => (
            <div
              key={row.id || `card-${rowIndex}`}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3"
            >
              {columns.map((col, colIndex) => {
                // On masque la colonne "Actions" dans le corps, elle sera rendue séparément en bas
                if (col.Header === 'Actions') return null;

                const value = row[col.accessor];
                const displayValue = col.Cell
                  ? col.Cell({ value, row, index: rowIndex })
                  : (value ?? '-');

                return (
                  <div
                    key={`mobile-${rowIndex}-${colIndex}`}
                    className="flex justify-between items-start"
                  >
                    <span className="text-sm font-medium text-gray-600 min-w-0 flex-shrink-0 mr-3">
                      {col.Header}:
                    </span>
                    <div className="text-sm text-gray-900 text-right flex-1 min-w-0">
                      {displayValue}
                    </div>
                  </div>
                );
              })}

              {/* Actions en bas de carte */}
              {columns.find((c) => c.Header === 'Actions') && (
                <div className="pt-3 border-t border-gray-100 flex justify-end">
                  {(() => {
                    const actionCol = columns.find((c) => c.Header === 'Actions');
                    return actionCol?.Cell?.({
                      value: row[actionCol.accessor],
                      row,
                      index: rowIndex,
                    });
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination mobile */}
        {totalPages > 1 && (
          <MobilePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        )}
      </div>
    );
  }

  // Vue desktop : tableau
  return (
    <div className="space-y-4">
      {title && <TableHeader title={title} description={description} />}

      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${containerClassName}`}>
        <div className="overflow-x-auto">
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
              {currentData.map((row, rowIndex) => (
                <tr
                  key={row.id || `row-${rowIndex}`}
                  className={
                    typeof rowClassName === 'function'
                      ? rowClassName(row, rowIndex)
                      : rowClassName || 'hover:bg-gray-50 transition-colors'
                  }
                >
                  {columns.map((col, colIndex) => (
                    <td
                      key={`td-${rowIndex}-${colIndex}`}
                      className={`px-6 py-4 ${col.cellClassName || 'text-gray-700'}`}
                    >
                      {col.Cell
                        ? col.Cell({ value: row[col.accessor], row, index: rowIndex })
                        : (row[col.accessor] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination desktop */}
        {totalPages > 1 && (
          <DesktopPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
          />
        )}
      </div>
    </div>
  );
};

const TableHeader = ({ title, description }) => (
  <div className="px-2 lg:px-0">
    <h2 className="text-lg lg:text-xl font-semibold text-gray-900">{title}</h2>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
  </div>
);

const MobilePagination = ({ currentPage, totalPages, onPageChange }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <div className="flex items-center justify-between">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center px-3 py-2 h-11 min-h-[44px] min-w-[44px] text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FiChevronLeft className="w-4 h-4 mr-1" />
        Précédent
      </button>

      <span className="text-sm text-gray-700">
        Page {currentPage} sur {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center px-3 py-2 h-11 min-h-[44px] min-w-[44px] text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Suivant
        <FiChevronRight className="w-4 h-4 ml-1" />
      </button>
    </div>
  </div>
);

const DesktopPagination = ({ currentPage, totalPages, onPageChange, totalItems, startIndex, endIndex }) => {
  // Calcule une fenêtre de pages max 5
  const getPageWindow = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const pages = getPageWindow();

  return (
    <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center text-sm text-gray-700">
          <span>
            Affichage {startIndex + 1} à {endIndex} sur {totalItems} résultats
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>

          {pages.map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`relative inline-flex items-center px-4 py-2 text-sm font-medium border ${
                currentPage === pageNum
                  ? 'bg-blue-50 border-blue-500 text-blue-600'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {pageNum}
            </button>
          ))}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Table;
