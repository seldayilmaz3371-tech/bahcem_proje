/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Leaf, Lock, User as UserIcon, AlertCircle } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (token: string, user: any, permissions: string[]) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Kullanıcı adı ve şifre alanları zorunludur.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Giriş yapılamadı. Kullanıcı adı veya şifreyi kontrol edin.");
      }

      onLoginSuccess(data.token, data.user, data.permissions || []);
    } catch (err: any) {
      setError(err.message || "Sunucuya bağlanırken bir sorun oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (user: string) => {
    if (user === "admin") {
      setUsername("admin");
      setPassword("admin123");
    } else {
      setUsername("calisan1");
      setPassword("calisan123");
    }
  };

  return (
    <div id="login-screen-container" className="min-h-screen bg-[#f3f6f2] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-[#556b2f] rounded-2xl flex items-center justify-center shadow-md shadow-[#556b2f]/20">
            <Leaf className="h-9 w-9 text-[#f7f9f6]" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-[#1a2416] font-display">
          Mersin AgriTech
        </h2>
        <p className="mt-2 text-center text-sm text-[#5a6a55]">
          Toroslar & Değirmençay Zeytinlik Tarım Hafızası ve Karar Destek Sistemi
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#f7f9f6] py-8 px-4 shadow-lg rounded-3xl sm:px-10 border border-[#e2e8df]">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-sm flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[#2d3a2a]">
                Kullanıcı Adı
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-[#889980]" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f] focus:border-transparent transition-all"
                  placeholder="Kullanıcı adınızı girin"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#2d3a2a]">
                Şifre
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-[#889980]" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f] focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-2xl shadow-sm text-sm font-semibold text-white bg-[#556b2f] hover:bg-[#415324] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#556b2f] disabled:opacity-50 transition-colors"
              >
                {loading ? "Giriş Yapılıyor..." : "Sisteme Giriş Yap"}
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-[#e2e8df] pt-6 text-center">
            <span className="text-xs text-[#80907a] uppercase font-bold tracking-wider">Hızlı Erişim Test Kullanıcıları</span>
            <div className="mt-3 flex gap-2 justify-center">
              <button
                id="quick-admin-login"
                type="button"
                onClick={() => handleQuickLogin("admin")}
                className="px-4 py-2 text-xs border border-[#cdd4ca] rounded-2xl bg-[#f7f9f6] text-[#2d3a2a] hover:bg-[#edf2eb] font-medium transition-all"
              >
                Yönetici Hesabı
              </button>
              <button
                id="quick-worker-login"
                type="button"
                onClick={() => handleQuickLogin("worker")}
                className="px-4 py-2 text-xs border border-[#cdd4ca] rounded-2xl bg-[#f7f9f6] text-[#2d3a2a] hover:bg-[#edf2eb] font-medium transition-all"
              >
                Saha Çalışanı Hesabı
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
