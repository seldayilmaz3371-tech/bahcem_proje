/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  LayoutDashboard, 
  Map, 
  Eye, 
  Package, 
  CircleDollarSign, 
  BrainCircuit, 
  FolderOpen, 
  ShieldAlert,
  LogOut,
  Leaf,
  User as UserIcon
} from "lucide-react";
import { ActiveTab, User } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  user: User;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Tarla Paneli", icon: LayoutDashboard },
    { id: "parcels", label: "Parseller & Ağaçlar", icon: Map },
    { id: "observations", label: "Saha Gözlemleri", icon: Eye },
    { id: "inventory", label: "Stok & Depo", icon: Package },
    { id: "finance", label: "Mali Defter & Gelir", icon: CircleDollarSign },
    { id: "ai-advisor", label: "Yapay Zeka Karar Destek", icon: BrainCircuit },
    { id: "document-hub", label: "RAG Doküman Havuzu", icon: FolderOpen },
    { id: "activities", label: "Sistem Logları", icon: ShieldAlert },
  ];

  return (
    <div id="app-sidebar" className="flex flex-col w-64 bg-[#23301f] text-[#f1f5f0] border-r border-[#192416] shrink-0">
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

      {/* User Card */}
      <div className="px-4 py-4 mx-2 mt-4 rounded-2xl bg-[#2e422a] border border-[#3b5536] flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#556b2f] flex items-center justify-center font-bold text-white shrink-0">
          <UserIcon className="h-5 w-5 text-emerald-100" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-white truncate">{user.fullName}</h2>
          <p className="text-[10px] text-[#9bb794] font-medium uppercase tracking-wider">{user.role}</p>
        </div>
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
              onClick={() => setActiveTab(item.id as ActiveTab)}
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
  );
}
