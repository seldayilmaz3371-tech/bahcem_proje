/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Map, 
  Eye, 
  Package, 
  CircleDollarSign, 
  BrainCircuit, 
  TrendingUp,
  FolderOpen, 
  ShieldAlert,
  LogOut,
  Leaf,
  User as UserIcon,
  Bell,
  Snowflake,
  PackageX,
  Info,
  X
} from "lucide-react";
import { ActiveTab, User, Notification } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  user: User;
  onLogout: () => void;
  /** Whether the mobile drawer is currently open. Ignored on desktop, where the sidebar is always visible (see the md: breakpoint classes below). */
  isMobileOpen: boolean;
  /** Called when the drawer should close on mobile — backdrop tap or a navigation item selected. */
  onMobileClose: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, isMobileOpen, onMobileClose }: SidebarProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchNotifications = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/notifications", { headers });
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleToggleNotifications = () => {
    const opening = !showNotifications;
    setShowNotifications(opening);
    if (opening) {
      fetchNotifications(); // Refresh in case time has passed since mount
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/notifications/mark-read", { method: "POST", headers });
      if (res.ok) {
        setNotifications([]);
        setShowNotifications(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    if (type === "Frost") return <Snowflake className="h-4 w-4 text-sky-500" />;
    if (type === "LowStock") return <PackageX className="h-4 w-4 text-amber-500" />;
    return <Info className="h-4 w-4 text-[#556b2f]" />;
  };

  const menuItems = [
    { id: "dashboard", label: "Tarla Paneli", icon: LayoutDashboard },
    { id: "parcels", label: "Parseller & Ağaçlar", icon: Map },
    { id: "observations", label: "Saha Gözlemleri", icon: Eye },
    { id: "inventory", label: "Stok & Depo", icon: Package },
    { id: "finance", label: "Mali Defter & Gelir", icon: CircleDollarSign },
    { id: "ai-advisor", label: "Yapay Zeka Karar Destek", icon: BrainCircuit },
    { id: "photo-growth", label: "Fotoğraflı Gelişim Analizi", icon: TrendingUp },
    { id: "document-hub", label: "RAG Doküman Havuzu", icon: FolderOpen },
    { id: "activities", label: "Sistem Logları", icon: ShieldAlert },
  ];

  return (
    <>
      {/* Mobile-only backdrop, dismisses the drawer when tapped. Never rendered on desktop (md:hidden), where the sidebar is a static column, not an overlay. */}
      {isMobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <div
        id="app-sidebar"
        className={`flex flex-col w-64 bg-[#23301f] text-[#f1f5f0] border-r border-[#192416] shrink-0
          fixed inset-y-0 left-0 z-50 transition-transform duration-200
          md:static md:translate-x-0
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-[#2d3f28]">
        <div className="p-2 bg-[#556b2f] rounded-xl text-white">
          <Leaf className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold font-display tracking-tight text-white">Mersin AgriTech</h1>
          <p className="text-[10px] text-[#80997a] font-mono tracking-wider uppercase">Zeytin Hafızası v1.0</p>
        </div>
      </div>

      {/* User Card + Notification Bell */}
      <div className="px-4 py-4 mx-2 mt-4 rounded-2xl bg-[#2e422a] border border-[#3b5536] flex items-center gap-3 relative">
        <div className="h-10 w-10 rounded-xl bg-[#556b2f] flex items-center justify-center font-bold text-white shrink-0">
          <UserIcon className="h-5 w-5 text-emerald-100" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white truncate">{user.fullName}</h2>
          <p className="text-[10px] text-[#9bb794] font-medium uppercase tracking-wider">{user.role}</p>
        </div>

        <button
          id="notification-bell-btn"
          onClick={handleToggleNotifications}
          title="Bildirimler"
          aria-label="Bildirimler"
          className="relative shrink-0 p-2 rounded-xl text-[#abbfad] hover:bg-[#3b5536] hover:text-white transition-colors"
        >
          <Bell className="h-4 w-4" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </button>

        {showNotifications && (
          <div
            id="notification-dropdown"
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#2e422a] border border-[#3b5536] rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3b5536]">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Bildirimler ({notifications.length})</span>
              <button
                onClick={() => setShowNotifications(false)}
                aria-label="Kapat"
                className="text-[#9bb794] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-[#3b5536]/60">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div key={n.id} className="px-4 py-3 flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">{getNotificationIcon(n.type)}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">{n.title}</p>
                      <p className="text-[11px] text-[#c3d1c1] mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-4 py-6 text-xs text-[#9bb794] italic text-center">Okunmamış bildiriminiz yok.</p>
              )}
            </div>

            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="w-full px-4 py-2.5 text-[11px] font-bold text-emerald-200 hover:bg-[#3b5536] transition-colors border-t border-[#3b5536]"
              >
                Tümünü Okundu İşaretle
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              id={`sidebar-nav-${item.id}`}
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as ActiveTab);
                onMobileClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                isActive 
                  ? "bg-[#556b2f] text-white shadow-sm shadow-black/10" 
                  : "text-[#abbfad] hover:bg-[#2d3f28] hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-[#879d8a]"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout Area */}
      <div className="p-4 border-t border-[#2d3f28]">
        <button
          id="sidebar-logout-btn"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-[#382020]/40 hover:text-red-100 rounded-xl transition-colors"
        >
          <LogOut className="h-4 w-4 text-red-300" />
          <span>Oturumu Kapat</span>
        </button>
      </div>
      </div>
    </>
  );
}
