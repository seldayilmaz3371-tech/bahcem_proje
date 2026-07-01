/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Clock, ShieldAlert, RefreshCw, Search } from "lucide-react";
import { ActivityLog } from "../types";

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/activities", { headers });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    return log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
           log.details.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Sistem denetim günlükleri yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="activity-logs-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Sistem Denetim Günlükleri</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Mersin AgriTech platformu üzerinde gerçekleştirilen işlemlerin güvenlik ve denetim kayıtları
          </p>
        </div>
        <button
          id="refresh-logs-btn"
          onClick={fetchLogs}
          className="self-start flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#556b2f] border border-[#556b2f] rounded-2xl hover:bg-[#556b2f]/5 transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Günlükleri Yenile</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-4 shadow-sm">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#80907a]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="İşlem adı veya detaylarda ara..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
          />
        </div>
      </div>

      {/* Audit Log Timeline */}
      <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm">
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <div 
                id={`audit-log-row-${log.id}`}
                key={log.id} 
                className="p-4 rounded-2xl bg-[#f7f9f6] border border-[#dee5db]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#556b2f]/30 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-stone-200 text-stone-700 font-mono">
                      {log.action}
                    </span>
                    <span className="text-[11px] font-semibold text-[#556b2f]">Kullanıcı ID: {log.userId}</span>
                  </div>
                  <p className="text-xs text-[#2d3a2a] leading-relaxed font-medium">{log.details}</p>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className="text-[11px] text-[#80907a] font-mono flex items-center gap-1 justify-end">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(log.createdAt).toLocaleString("tr-TR")}
                  </span>
                  {log.ipAddress && (
                    <span className="block text-[9px] text-stone-400 font-mono">IP: {log.ipAddress}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <ShieldAlert className="h-10 w-10 text-[#80907a] mx-auto mb-2" />
              <p className="text-xs text-[#5a6a55] italic">Kriterlere uyan denetim kaydı bulunamadı.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
