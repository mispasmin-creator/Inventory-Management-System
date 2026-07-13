import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Filter, Columns } from 'lucide-react';

const Table = ({ 
  columns, 
  data = [], 
  searchPlaceholder = "Search records...", 
  filterKey = "", 
  filterOptions = [], 
  filterPlaceholder = "All Categories",
  exportFileName = "report",
  actions = null,
  legend = null,
  legendKey = null,
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
  const [activeLegendValue, setActiveLegendValue] = useState(null);

  const [columnVisibility, setColumnVisibility] = useState(() => {
    const initial = {};
    columns.forEach(c => {
      if (c.header) initial[c.header] = true;
    });
    return initial;
  });
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const columnFilterRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnFilterRef.current && !columnFilterRef.current.contains(event.target)) {
        setShowColumnFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeColumns = columns.filter(col => columnVisibility[col.header] !== false);

  const handleLegendClick = (value) => {
    setActiveLegendValue(prev => (prev === value ? null : value));
    if (!serverSide) setLocalCurrentPage(1);
  };

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

    // Legend click-to-filter: applies to whatever rows are currently loaded,
    // independent of serverSide (server pagination/search stay untouched).
    if (legendKey && activeLegendValue) {
      result = result.filter(row => {
        const val = row[legendKey];
        return val && String(val).trim().toLowerCase() === String(activeLegendValue).trim().toLowerCase();
      });
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
  }, [data, searchQuery, filterValue, filterKey, sortConfig, serverSide, legendKey, activeLegendValue]);

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
    const headers = activeColumns.map(c => c.header).join(',');
    
    // Rows
    const rows = processedData.map(row => {
      return activeColumns.map(col => {
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--ink-faint)" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-4 py-2.5 text-xs font-medium rounded-xl glass-input"
          />
        </div>

        {/* Filters and Actions */}
        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">

          {/* Dropdown Filter */}
          {filterKey && (
            <div className="relative flex items-center shrink-0">
              <Filter className="absolute left-3 h-3.5 w-3.5 text-(--ink-faint) pointer-events-none" />
              <select
                value={filterValue}
                onChange={handleFilterChange}
                className="pl-9 pr-8 py-2.5 text-xs rounded-xl glass-input appearance-none cursor-pointer font-medium"
              >
                <option value="">{filterPlaceholder}</option>
                {filterOptions.map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-(--ink-faint) pointer-events-none" />
            </div>
          )}

          {/* Table Custom Actions Slot */}
          {actions}

          {/* Column Filter Dropdown */}
          <div className="relative flex items-center shrink-0" ref={columnFilterRef}>
            <button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              className="flex items-center gap-2 px-3 py-2.5 text-xs rounded-xl glass-input cursor-pointer font-medium hover:bg-(--surface-mid) transition-colors"
            >
              <Columns className="w-3.5 h-3.5 text-(--ink-faint)" />
              <span>Columns</span>
              <ChevronDown className={`w-3.5 h-3.5 text-(--ink-faint) transition-transform ${showColumnFilter ? 'rotate-180' : ''}`} />
            </button>
            
            {showColumnFilter && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-(--surface) border border-(--line) rounded-xl shadow-lg z-50 p-2 max-h-64 overflow-y-auto">
                <div className="text-[10px] uppercase font-bold tracking-wider text-(--ink-faint) mb-2 px-2 pt-1">
                  Show/Hide Columns
                </div>
                <div className="flex flex-col gap-1">
                  {columns.map((col, idx) => col.header ? (
                    <label key={idx} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-(--surface-mid) rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={columnVisibility[col.header] !== false}
                        onChange={(e) => {
                          setColumnVisibility(prev => ({
                            ...prev,
                            [col.header]: e.target.checked
                          }));
                        }}
                        className="rounded text-(--brand-green) focus:ring-(--brand-green) w-3.5 h-3.5 cursor-pointer accent-(--brand-green)"
                      />
                      <span className="text-xs text-(--ink) font-medium truncate">{col.header}</span>
                    </label>
                  ) : null)}
                </div>
              </div>
            )}
          </div>

          {/* Export to CSV Button */}
          <button
            onClick={exportToCSV}
            disabled={data.length === 0}
            className="btn-green-solid disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Colour-coding legend (click a pill to filter the table to that status) */}
      {legend && legend.length > 0 && (
        <div className="status-legend">
          {legend.map((item, idx) => {
            const clickable = Boolean(legendKey && item.value !== undefined);
            const isActive = clickable && activeLegendValue === item.value;
            return (
              <button
                key={idx}
                type="button"
                onClick={clickable ? () => handleLegendClick(item.value) : undefined}
                className={`status-legend-pill${clickable ? ' status-legend-pill--clickable' : ''}${isActive ? ' is-active' : ''}`}
                style={isActive ? { borderColor: item.color, boxShadow: `0 0 0 2px ${item.color}33` } : undefined}
              >
                <span className="status-legend-swatch" style={{ background: item.color }} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Table Grid */}
      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-(--line) bg-(--surface) shadow-md">
        <table className="w-full border-collapse text-center text-xs text-(--ink)">
          <thead className="table-header-green uppercase tracking-wider sticky top-0 z-10">
            <tr>
              {activeColumns.map((col, idx) => {
                const isSortable = !disableSorting && col.sortable !== false && col.accessor;
                return (
                  <th
                    key={idx}
                    onClick={() => isSortable && handleSort(col.accessor)}
                    className={`px-4 py-3 font-bold text-[10.5px] sticky top-0 bg-(--surface-mid) z-10 ${
                      isSortable ? 'cursor-pointer hover:bg-(--brand-green-soft) hover:text-(--brand-green-dark) select-none transition-colors duration-150' : ''
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="text-(--ink-faint)">
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
          <tbody className="divide-y divide-(--line-soft) relative">
            {isLoading && (
              <tr className="absolute inset-0 z-20 bg-(--surface)/70 backdrop-blur-[1px] flex items-center justify-center">
                <td>
                  <div className="w-6 h-6 border-2 border-(--brand-green) border-t-transparent rounded-full animate-spin shadow-lg"></div>
                </td>
              </tr>
            )}
            {paginatedData.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={activeColumns.length} className="text-center py-12 text-(--ink-faint) text-sm">
                  No records matching the selection.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-(--brand-green-soft) transition-colors duration-150"
                >
                  {activeColumns.map((col, cIdx) => {
                    const extraClass = typeof col.cellClassName === 'function'
                      ? col.cellClassName(row, (currentPage - 1) * pageSize + rIdx)
                      : (col.cellClassName || '');
                    return (
                      <td key={cIdx} className={`px-4 py-2.5 whitespace-nowrap ${extraClass}`}>
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 pt-1 text-xs">
          <div className="text-(--ink-faint) font-medium">
            Showing <span className="font-bold text-(--ink)">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-bold text-(--ink)">
              {Math.min(currentPage * pageSize, totalItems)}
            </span>{' '}
            of <span className="font-bold text-(--ink)">{totalItems}</span> rows
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size Select */}
            <div className="flex items-center gap-2">
              <span className="text-(--ink-faint) font-medium">Rows per page:</span>
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
                className="px-2.5 py-1.5 rounded-lg bg-(--surface) border border-(--line) text-(--ink) text-[11px] font-semibold cursor-pointer"
              >
                {[50, 100, 500, 1000].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>

            {/* Pagination Actions */}
            <div className="flex items-center gap-1.5">
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
                className="p-1.5 rounded-lg bg-(--surface) border border-(--line) text-(--ink-muted) hover:text-(--brand-green-dark) hover:border-(--brand-green)/30 hover:bg-(--brand-green-soft) disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-(--surface) disabled:hover:text-(--ink-muted) transition-all duration-150 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-(--ink) px-2.5 select-none font-bold">
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
                className="p-1.5 rounded-lg bg-(--surface) border border-(--line) text-(--ink-muted) hover:text-(--brand-green-dark) hover:border-(--brand-green)/30 hover:bg-(--brand-green-soft) disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-(--surface) disabled:hover:text-(--ink-muted) transition-all duration-150 cursor-pointer"
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
