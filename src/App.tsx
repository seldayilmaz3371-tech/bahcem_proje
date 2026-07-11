/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ParcelManager from "./components/ParcelManager";
import ObservationLog from "./components/ObservationLog";
import InventoryManager from "./components/InventoryManager";
import EquipmentManager from "./components/EquipmentManager";
import FinanceManager from "./components/FinanceManager";
import AIRecommendations from "./components/AIRecommendations";
import PhotoGrowthAnalysis from "./components/PhotoGrowthAnalysis";
import DocumentHub from "./components/DocumentHub";
import ActivityLogs from "./components/ActivityLogs";
import { ActiveTab, User } from "./types";
import { RefreshCw, WifiOff, UploadCloud, Menu } from "lucide-react";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useOfflineSync } from "./hooks/useOfflineSync";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("agri_token"));
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem("agri_active_tab");
    return (saved as ActiveTab) || "dashboard";
  });
  const [initializing, setInitializing] = useState(true);
  const isOnline = useOnlineStatus();
  const { pendingCount, isSyncing } = useOfflineSync(token);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleActiveTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    localStorage.setItem("agri_active_tab", tab);
  };

  // Validate session on load
  useEffect(() => {
    const validate = async () => {
      const storedToken = localStorage.getItem("agri_token");
      if (!storedToken) {
        setInitializing(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            "Authorization": `Bearer ${storedToken}`,
            "x-session-token": storedToken
          }
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setPermissions(data.permissions || []);
        } else {
          // Token expired or invalid
          localStorage.removeItem("agri_token");
          setToken(null);
        }
      } catch (err) {
        console.error("Session restoration error:", err);
      } finally {
        setInitializing(false);
      }
    };

    validate();
  }, [token]);

  const handleLoginSuccess = (newToken: string, loggedInUser: User, userPerms: string[]) => {
    localStorage.setItem("agri_token", newToken);
    setToken(newToken);
    setUser(loggedInUser);
    setPermissions(userPerms);
  };

  const handleLogout = async () => {
    try {
      const storedToken = localStorage.getItem("agri_token");
      if (storedToken) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${storedToken}`
          }
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem("agri_token");
      localStorage.removeItem("agri_active_tab");
      localStorage.removeItem("agri_selected_parcel_id");
      localStorage.removeItem("agri_current_report");
      setToken(null);
      setUser(null);
      setPermissions([]);
      setActiveTab("dashboard");
    }
  };

  if (initializing) {
    return (
      <div id="init-loader" className="min-h-screen bg-[#f3f6f2] flex flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-semibold text-[#5a6a55]">Mersin AgriTech yükleniyor...</span>
      </div>
    );
  }

  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div id="app-viewport-frame" className="flex h-screen bg-[#f7f9f6] text-[#1a2416] overflow-hidden">
      {/* Navigation Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleActiveTabChange} 
        user={user} 
        permissions={permissions}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main View Area */}
      <main id="app-main-view" className="flex-1 overflow-y-auto bg-[#fcfdfc]">
        {/* Mobile-only menu button. Deliberately `fixed` (not `sticky`) and
            given a higher z-index than the status banners below: this is a
            persistent navigation control, not a scrolling status message,
            so it must remain in a constant screen position and stay
            clickable regardless of scroll position or which banner (if
            any) is currently showing. */}
        <button
          id="mobile-sidebar-toggle"
          onClick={() => setIsMobileSidebarOpen(true)}
          aria-label="Menüyü aç"
          className="md:hidden fixed top-3 left-3 z-[60] p-2.5 bg-[#23301f] text-white rounded-xl shadow-md"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Status banners share a single sticky wrapper so that if both
            were ever visible in sequence (e.g. connectivity just returned
            but a sync is still in progress), they stack in normal document
            flow instead of each independently competing for the same
            sticky top-0 position. */}
        <div className="sticky top-0 z-50">
          {!isOnline && (
            <div
              id="offline-banner"
              role="alert"
              className="bg-red-600 text-white px-4 py-2.5 pl-14 md:pl-4 flex items-center justify-center gap-2 text-sm font-semibold shadow-md"
            >
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>İnternet bağlantınız kesildi. Saha Gözlemi ve fotoğraf ekleyebilirsiniz — bağlantı gelince otomatik gönderilecek. Yapay Zeka özellikleri şu an kullanılamaz.</span>
            </div>
          )}
          {isOnline && pendingCount > 0 && (
            <div
              id="pending-sync-banner"
              role="status"
              className="bg-amber-500 text-white px-4 py-2 pl-14 md:pl-4 flex items-center justify-center gap-2 text-sm font-semibold shadow-md"
            >
              <UploadCloud className={`h-4 w-4 shrink-0 ${isSyncing ? "animate-bounce" : ""}`} />
              <span>{isSyncing ? "Bekleyen kayıtlar gönderiliyor..." : `${pendingCount} bekleyen kayıt gönderilecek.`}</span>
            </div>
          )}
        </div>
        {activeTab === "dashboard" && <Dashboard setActiveTab={handleActiveTabChange} />}
        {activeTab === "parcels" && <ParcelManager />}
        {activeTab === "observations" && <ObservationLog />}
        {activeTab === "inventory" && <InventoryManager />}
        {activeTab === "equipment" && <EquipmentManager />}
        {activeTab === "finance" && <FinanceManager />}
        {activeTab === "ai-advisor" && <AIRecommendations />}
        {activeTab === "photo-growth" && <PhotoGrowthAnalysis />}
        {activeTab === "document-hub" && <DocumentHub />}
        {activeTab === "activities" && <ActivityLogs />}
      </main>
    </div>
  );
}
