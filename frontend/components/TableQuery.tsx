import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Trash2, Filter, Calendar, Copy, Info } from 'lucide-react';
import { TableQueryParams, TableRow } from '../types';
import { queryTableData } from '../services/backendService';

const TABLE_CONFIG: Record<string, { columns: { key: string; label: string; align?: 'left' | 'right' | 'center'; type?: 'date' | 'number' | 'text' }[] }> = {
  'acct_bal_new2': {
    columns: [
      { key: 'acct_num', label: '账号 (acct_num)', type: 'text' },
      { key: 'org_num', label: '机构号 (org_num)', type: 'text' },
      { key: 'sbj_num', label: '科目号 (sbj_num)', type: 'text' },
      { key: 'ccy', label: '币种 (ccy)', type: 'text' },
      { key: 'sbact_acct_bal', label: '分户账余额 (sbact_acct_bal)', align: 'right', type: 'number' },
      { key: 'gnl_ldgr_bal', label: '总账余额 (gnl_ldgr_bal)', align: 'right', type: 'number' },
      { key: 'acg_dt', label: '会计日期 (acg_dt)', align: 'right', type: 'date' },
      { key: 'dt', label: '分区键 (dt)', type: 'text' }
    ]
  },
  'vchr_hist': {
    columns: [
      { key: 'acct_num', label: '账号 (acct_num)', type: 'text' },
      { key: 'vchr_num', label: '传票号 (vchr_num)', type: 'text' },
      { key: 'sbj_num', label: '科目号 (sbj_num)', type: 'text' },
      { key: 'org_num', label: '机构号 (org_num)', type: 'text' },
      { key: 'amt', label: '金额 (amt)', align: 'right', type: 'number' },
      { key: 'ccy', label: '货币符 (ccy)', type: 'text' },
      { key: 'ldin_flg', label: '借贷标志 (ldin_flg)', align: 'center', type: 'text' },
      { key: 'rd_flg', label: '红蓝字标志 (rd_flg)', align: 'center', type: 'text' },
      { key: 'acg_dt', label: '会计日期 (acg_dt)', align: 'right', type: 'date' },
      { key: 'txn_dt', label: '交易日期 (txn_dt)', align: 'right', type: 'date' },
      { key: 'txn_tm', label: '交易时间 (txn_tm)', align: 'right', type: 'text' },
      { key: 'orig_txn_dt', label: '原交易日期 (orig_txn_dt)', align: 'right', type: 'date' },
      { key: 'orig_vchr_num', label: '原传票号 (orig_vchr_num)', type: 'text' },
      { key: 'vchr_inr_serl', label: '传票套内序列号', type: 'text' },
      { key: 'dt_date', label: '分区键日期 (dt_date)', align: 'right', type: 'date' }
    ]
  },
  'txn_hist': {
    columns: [
      { key: 'acct_num', label: '账号 (acct_num)', type: 'text' },
      { key: 'vchr_num', label: '传票号 (vchr_num)', type: 'text' },
      { key: 'acg_acct_num', label: '记账账号 (acg_acct_num)', type: 'text' },
      { key: 'txn_amt', label: '交易金额 (txn_amt)', align: 'right', type: 'number' },
      { key: 'crn_bal', label: '当前余额 (crn_bal)', align: 'right', type: 'number' },
      { key: 'ccy', label: '交易币种 (ccy)', type: 'text' },
      { key: 'ldin_flg', label: '借贷标识 (ldin_flg)', align: 'center', type: 'text' },
      { key: 'acg_dt', label: '会计日期 (acg_dt)', align: 'right', type: 'date' },
      { key: 'txn_ofst_dt', label: '交易冲销日期 (txn_ofst_dt)', align: 'right', type: 'date' },
      { key: 'orig_txn_acg_dt', label: '原交易会计日期', align: 'right', type: 'date' },
      { key: 'aplct_stm_seq_num', label: '请求方流水号', type: 'text' },
      { key: 'orig_txn_log_num', label: '原交易日志号', type: 'text' },
      { key: 'dt_date', label: '分区键日期 (dt_date)', align: 'right', type: 'date' }
    ]
  },
  'recon_bal': {
    columns: [
      { key: 'org_num', label: '机构号 (org_num)', type: 'text' },
      { key: 'sbj_num', label: '科目号 (sbj_num)', type: 'text' },
      { key: 'ccy', label: '交易币种 (ccy)', type: 'text' },
      { key: 'sbact_acct_bal', label: '分户账余额 (sbact_acct_bal)', align: 'right', type: 'number' },
      { key: 'gnl_ldgr_bal', label: '总账余额 (gnl_ldgr_bal)', align: 'right', type: 'number' },
      { key: 'tot_mint_dif', label: '总分差额 (tot_mint_dif)', align: 'right', type: 'number' },
      { key: 'dt_date', label: '分区键日期 (dt_date)', align: 'right', type: 'date' }
    ]
  }
};

const TableQuery: React.FC = () => {
  const [params, setParams] = useState<TableQueryParams>({
    tableName: 'acct_bal_new2',
    accountNum: '',
    orgNum: '',
    subjNum: '',
    startDate: '2025-06-01',
    endDate: '2025-06-10',
    page: 1,
    pageSize: 20
  });

  const [data, setData] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Helper to get current columns
  const currentColumns = TABLE_CONFIG[params.tableName]?.columns || TABLE_CONFIG['acct_bal_new2'].columns;

  const handleQuery = async (resetPage = true) => {
    setLoading(true);
    setSelectedRows(new Set()); // Clear selections on new query

    let queryParams = { ...params };
    if (resetPage) {
      queryParams.page = 1;
      setParams(prev => ({ ...prev, page: 1 })); // Update state for UI consistency
    }

    try {
      const result: any = await queryTableData(queryParams);
      // Handle both old array format (fallback) and new object format
      if (Array.isArray(result)) {
        setData(result);
        setTotal(result.length);
      } else {
        setData(result.data || []);
        setTotal(result.total || 0);
      }
    } catch (e) {
      console.error("Query failed", e);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (loading) return; // Prevent multiple requests
    setLoading(true);
    setSelectedRows(new Set()); // Clear selections on page change

    const newParams = { ...params, page: newPage };
    setParams(newParams); // Update state immediately

    try {
      const result: any = await queryTableData(newParams);
      if (Array.isArray(result)) {
        setData(result);
        setTotal(result.length);
      } else {
        setData(result.data || []);
        setTotal(result.total || 0);
      }
    } catch (e) {
      console.error("Page change query failed", e);
      // Optionally revert page or show error
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === data.length && data.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map(r => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRows(newSet);
  };

  const formatDate = (dateStr: string) => {
    // Basic formatting for demo, assumes standard string input. 
    // Ideally use date-fns or similar for robustness.
    return dateStr ? dateStr.replace('T', ' ').slice(0, 16) : '-';
  };

  const totalPages = Math.ceil(total / (params.pageSize || 20));

  const handleExport = () => {
    if (selectedRows.size === 0) {
      // If no rows selected, export all visible rows? 
      // User says "checklist data", strongly implying selection.
      // If nothing selected, let's alert.
      alert("请先勾选需要导出的数据");
      return;
    }

    const rowsToExport = data.filter(r => selectedRows.has(r.id));

    // Format data for export (use column labels)
    const exportData = rowsToExport.map(row => {
      const newRow: Record<string, any> = {};
      currentColumns.forEach(col => {
        // Remove the (key) part from label if cleaner output desired, but let's keep it matches exact "columns"
        newRow[col.label] = row[col.key];
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");

    // Generate filename based on table and date
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${params.tableName}_${dateStr}.xlsx`);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          表格查询
        </h1>
        <p className="text-slate-500 text-sm mt-1">查询系统中的表格数据</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">

        {/* Filters Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Table Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500">选择表</label>
              <select
                className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2.5 outline-none transition-all"
                value={params.tableName}
                onChange={(e) => setParams({ ...params, tableName: e.target.value })}
              >
                <option value="acct_bal_new2">分户余额表 (acct_bal_new2)</option>
                <option value="vchr_hist">传票历史表 (vchr_hist)</option>
                <option value="txn_hist">交易历史表(txn_hist)</option>
                <option value="recon_bal">总分不平表 (recon_bal)</option>
              </select>
            </div>

            {/* Input Fields */}
            <InputGroup label="账号" placeholder="输入账号 (选填)" value={params.accountNum} onChange={(v: string) => setParams({ ...params, accountNum: v })} />
            <InputGroup label="机构号" placeholder="输入机构号 (选填)" value={params.orgNum} onChange={(v: string) => setParams({ ...params, orgNum: v })} />
            <InputGroup label="科目号" placeholder="输入科目号 (选填)" value={params.subjNum} onChange={(v: string) => setParams({ ...params, subjNum: v })} />

            {/* Date Range (Merged for Grid layout, spans 2 cols if space allows or stays 1x2) */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500">开始日期</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400"><Calendar size={14} /></div>
                  <input
                    type="date"
                    className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full pl-9 p-2.5 outline-none transition-all"
                    value={params.startDate}
                    onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500">结束日期</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400"><Calendar size={14} /></div>
                  <input
                    type="date"
                    className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full pl-9 p-2.5 outline-none transition-all"
                    value={params.endDate}
                    onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Spacer to push buttons to right if needed, or just let them sit */}
            <div className="lg:col-span-2 flex items-end justify-end gap-3">
              <button
                onClick={handleExport}
                className="text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-medium rounded-lg text-sm px-5 py-2.5 transition-colors flex items-center gap-2"
              >
                <Download size={16} /> 导出
              </button>
              <button
                onClick={() => handleQuery(true)} // Pass true to reset page to 1
                disabled={loading}
                className="text-white bg-[#0081E5] hover:bg-[#0056b3] focus:ring-4 focus:ring-[#0081E5]/20 font-medium rounded-lg text-sm px-6 py-2.5 flex items-center gap-2 transition-all shadow-sm hover:shadow disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? '查询中...' : <><Search size={16} /> 查询</>}
              </button>
            </div>
          </div>
        </div>

        {/* Data Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">

          {/* Helper Info Area */}
          {selectedRows.size > 0 && (
            <div className="bg-[#0081E5]/10 border-b border-[#0081E5]/20 px-6 py-2 flex items-center gap-3 text-sm text-[#0081E5]">
              <Info size={16} />
              <span className="font-medium">已选择 {selectedRows.size} 项数据</span>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setSelectedRows(new Set())}
                className="hover:underline font-medium cursor-pointer"
              >
                清空选择
              </button>
            </div>
          )}

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 font-bold uppercase bg-white border-b border-slate-200">
                <tr>
                  <th scope="col" className="p-4 w-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-[#0081E5] bg-gray-100 border-gray-300 rounded focus:ring-[#0081E5]"
                        checked={data.length > 0 && selectedRows.size === data.length}
                        onChange={toggleSelectAll}
                      />
                    </div>
                  </th>
                  {currentColumns.map((col) => (
                    <th key={col.key} scope="col" className={`px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={currentColumns.length + 1} className="px-6 py-20 text-center text-slate-300">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Search size={32} className="opacity-20" />
                        <span>暂无数据，请点击查询</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => {
                    const isSelected = selectedRows.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-slate-50 transition-colors ${isSelected ? 'bg-[#0081E5]/5' : 'hover:bg-slate-50'}`}
                      >
                        <td className="w-4 p-4">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-[#0081E5] bg-gray-100 border-gray-300 rounded focus:ring-[#0081E5]"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(row.id)}
                            />
                          </div>
                        </td>
                        {currentColumns.map((col) => (
                          <td key={col.key} className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.type === 'number' ? 'font-mono text-slate-700' : 'text-slate-600'}`}>
                            {col.key === 'acct_num' || col.key === 'accountNum' ? (
                              <div className="group flex items-center gap-2 justify-between">
                                <span className="truncate max-w-[150px]" title={row[col.key]}>{row[col.key]}</span>
                                <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity" title="复制" onClick={() => navigator.clipboard.writeText(row[col.key])}>
                                  <Copy size={12} />
                                </button>
                              </div>
                            ) : col.type === 'date' ? (
                              <span className="font-medium whitespace-nowrap">{formatDate(row[col.key])}</span>
                            ) : col.type === 'number' ? (
                              <span>{row[col.key] != null ? Number(row[col.key]).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</span>
                            ) : (
                              <span className="truncate max-w-[200px]" title={row[col.key]}>{row[col.key] || '-'}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex justify-between items-center text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span>共找到 {total} 条数据</span>
              <span>第 {params.page} 页 / 共 {totalPages} 页</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange((params.page || 1) - 1)}
                disabled={!params.page || params.page <= 1 || loading}
                className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => handlePageChange((params.page || 1) + 1)}
                disabled={!params.page || (params.page * (params.pageSize || 20) >= total) || loading}
                className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InputGroup = ({ label, placeholder, value, onChange }: any) => (
  <div className="flex flex-col gap-2">
    <label className="text-xs font-semibold text-slate-500">{label}</label>
    <input
      type="text"
      className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-1 focus:ring-[#0081E5] focus:border-[#0081E5] block w-full p-2.5 outline-none placeholder:text-slate-300 transition-all"
      placeholder={placeholder}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default TableQuery;