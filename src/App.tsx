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
import FinanceManager from "./components/FinanceManager";
import AIRecommendations from "./components/AIRecommendations";
import PhotoGrowthAnalysis from "./components/PhotoGrowthAnalysis";
import DocumentHub from "./components/DocumentHub";
import ActivityLogs from "./components/ActivityLogs";
import { ActiveTab, User } from "./types";
import { RefreshCw } from "lucide-react";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("agri_token"));
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem("agri_active_tab");
    return (saved as ActiveTab) || "dashboard";
  });
  const [initializing, setInitializing] = useState(true);

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
        onLogout={handleLogout} 
      />

      {/* Main View Area */}
      <main id="app-main-view" className="flex-1 overflow-y-auto bg-[#fcfdfc]">
        {activeTab === "dashboard" && <Dashboard setActiveTab={handleActiveTabChange} />}
        {activeTab === "parcels" && <ParcelManager />}
        {activeTab === "observations" && <ObservationLog />}
        {activeTab === "inventory" && <InventoryManager />}
        {activeTab === "finance" && <FinanceManager />}
        {activeTab === "ai-advisor" && <AIRecommendations />}
        {activeTab === "photo-growth" && <PhotoGrowthAnalysis />}
        {activeTab === "document-hub" && <DocumentHub />}
        {activeTab === "activities" && <ActivityLogs />}
      </main>
    </div>
  );
}
