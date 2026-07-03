import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';

const Table = ({ 
  columns, 
  data = [], 
  searchPlaceholder = "Search records...", 
  filterKey = "", 
  filterOptions = [], 
  filterPlaceholder = "All Categories",
  exportFileName = "report",
  actions = null,
  disableSorting = false,
  serverSide = false,
  serverTotalItems = 0,
  serverCurrentPage = 1,
  serverPageSize = 100,
  onServerSearchChange,
  onServerFilterChange,
  onServerPageChange,
  onServerPageSizeChange,
  isLoading = false
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [localFilterValue, setLocalFilterValue] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [localCurrentPage, setLocalCurrentPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(100);

  const searchQuery = localSearchQuery;
  const filterValue = localFilterValue;
  const currentPage = serverSide ? serverCurrentPage : localCurrentPage;
  const pageSize = serverSide ? serverPageSize : localPageSize;

  // Reset pagination on search or filter change
  const handleSearchChange = (e) => {
    setLocalSearchQuery(e.target.value);
    if (serverSide) {
      if (onServerSearchChange) onServerSearchChange(e.target.value);
    } else {
      setLocalCurrentPage(1);
    }
  };

  const handleFilterChange = (e) => {
    setLocalFilterValue(e.target.value);
    if (serverSide) {
      if (onServerFilterChange) onServerFilterChange(e.target.value);
    } else {
      setLocalCurrentPage(1);
    }
  };

  // Sort helper
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Process data (Filter -> Search -> Sort)
  const processedData = useMemo(() => {
    let result = [...data];

    if (!serverSide) {
      // 1. Apply category filter
      if (filterKey && filterValue) {
        result = result.filter(row => {
          const val = row[filterKey];
          return val && String(val).toLowerCase() === filterValue.toLowerCase();
        });
      }

      // 2. Apply global search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        result = result.filter(row => {
          return Object.values(row).some(cell => {
            if (cell === null || cell === undefined) return false;
            return String(cell).toLowerCase().includes(query);
          });
        });
      }
    }

    // 3. Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle numeric sorting
        if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
          valA = Number(valA);
          valB = Number(valB);
        } else {
          valA = valA ? String(valA).toLowerCase() : '';
          valB = valB ? String(valB).toLowerCase() : '';
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchQuery, filterValue, filterKey, sortConfig, serverSide]);

  // Pagination calculation
  const totalItems = serverSide ? serverTotalItems : processedData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  
  const paginatedData = useMemo(() => {
    if (serverSide) return processedData;
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize, serverSide]);

  // Export to CSV helper
  const exportToCSV = () => {
    if (processedData.length === 0) return;

    // Headers
    const headers = columns.map(c => c.header).join(',');
    
    // Rows
    const rows = processedData.map(row => {
      return columns.map(col => {
        let cellVal = '';
        if (typeof col.accessor === 'function') {
          cellVal = col.accessor(row);
        } else {
          cellVal = row[col.accessor] ?? '';
        }
        // Clean cell for CSV format (escape quotes and commas)
        const cellString = String(cellVal).replace(/"/g, '""');
        return cellString.includes(',') || cellString.includes('\n') 
          ? `"${cellString}"` 
          : cellString;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${exportFileName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg glass-input"
          />
        </div>

        {/* Filters and Actions */}
        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
          
          {/* Dropdown Filter */}
          {filterKey && (
            <div className="relative flex items-center shrink-0">
              <Filter className="absolute left-3 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              <select
                value={filterValue}
                onChange={handleFilterChange}
                className="pl-9 pr-6 py-2 text-xs rounded-lg glass-input appearance-none cursor-pointer pr-8 font-medium"
              >
                <option value="">{filterPlaceholder}</option>
                {filterOptions.map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Table Custom Actions Slot */}
          {actions}

          {/* Export to CSV Button */}
          <button
            onClick={exportToCSV}
            disabled={data.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-slate-800 text-slate-200 border border-slate-700/60 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:text-white font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-slate-900/30 backdrop-blur-md">
        <table className="w-full border-collapse text-left text-xs text-slate-300">
          <thead className="bg-slate-900 uppercase tracking-wider text-slate-400 border-b border-slate-800 sticky top-0 z-10">
            <tr>
              {columns.map((col, idx) => {
                const isSortable = !disableSorting && col.sortable !== false && col.accessor;
                return (
                  <th
                    key={idx}
                    onClick={() => isSortable && handleSort(col.accessor)}
                    className={`px-3 py-2 sm:px-4 sm:py-2.5 font-semibold sticky top-0 bg-slate-900 z-10 ${
                      isSortable ? 'cursor-pointer hover:bg-slate-800/40 select-none' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="text-slate-500">
                          {sortConfig.key === col.accessor ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3 opacity-25" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 relative">
            {isLoading && (
              <tr className="absolute inset-0 z-20 bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center">
                <td>
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
                </td>
              </tr>
            )}
            {paginatedData.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-10 text-slate-500">
                  No records matching the selection.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr 
                  key={rIdx} 
                  className="hover:bg-slate-800/10 transition-colors duration-150"
                >
                  {columns.map((col, cIdx) => {
                    const extraClass = typeof col.cellClassName === 'function' 
                      ? col.cellClassName(row, (currentPage - 1) * pageSize + rIdx) 
                      : (col.cellClassName || '');
                    return (
                      <td key={cIdx} className={`px-3 py-1.5 sm:px-4 sm:py-2 whitespace-nowrap ${extraClass}`}>
                        {col.render ? col.render(row, (currentPage - 1) * pageSize + rIdx) : (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor])}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs">
          <div className="text-slate-500">
            Showing <span className="font-semibold text-slate-300">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-slate-300">
              {Math.min(currentPage * pageSize, totalItems)}
            </span>{' '}
            of <span className="font-semibold text-slate-300">{totalItems}</span> rows
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size Select */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const newSize = Number(e.target.value);
                  if (serverSide) {
                    if (onServerPageSizeChange) onServerPageSizeChange(newSize);
                  } else {
                    setLocalPageSize(newSize);
                    setLocalCurrentPage(1);
                  }
                }}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px]"
              >
                {[50, 100, 500, 1000].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>

            {/* Pagination Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newPage = Math.max(currentPage - 1, 1);
                  if (serverSide) {
                    if (onServerPageChange) onServerPageChange(newPage);
                  } else {
                    setLocalCurrentPage(newPage);
                  }
                }}
                disabled={currentPage === 1}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 px-2 select-none font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => {
                  const newPage = Math.min(currentPage + 1, totalPages);
                  if (serverSide) {
                    if (onServerPageChange) onServerPageChange(newPage);
                  } else {
                    setLocalCurrentPage(newPage);
                  }
                }}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
