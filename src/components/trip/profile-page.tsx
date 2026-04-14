"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/supabase/auth";

interface ProfilePageProps {
  onNewTrip: () => void;
  onShowSaved: () => void;
}

export function ProfilePage({ onNewTrip, onShowSaved }: ProfilePageProps) {
  const { user, signOut, loading } = useAuth();
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    try {
      const trips = JSON.parse(localStorage.getItem("clickless_saved_trips") || "[]");
      setSavedCount(trips.length);
    } catch { /* ignore */ }
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";
  const avatarLetter = displayName[0]?.toUpperCase() || "T";
  const provider = user?.app_metadata?.provider === "google" ? "Google" : "Email";
  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f9fb] flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-[#c3c6ce] animate-spin">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f7f9fb]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-[#f2f4f6] py-6 z-50">
        <div className="px-8 mb-10">
          <h1 className="text-lg font-black text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>ClickLess AI</h1>
          <p className="text-xs text-[#43474d] font-medium">Digital Concierge</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={onNewTrip}
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full text-[#43474d] hover:bg-white/50 transition-colors">
            <span className="material-symbols-outlined">add_circle</span><span>New Trip</span>
          </button>
          <button onClick={onShowSaved}
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full text-[#43474d] hover:bg-white/50 transition-colors">
            <span className="material-symbols-outlined">bookmark</span><span>Saved Trips</span>
          </button>
          <button
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full text-[#002542] font-bold bg-white"
            aria-current="page">
            <span className="material-symbols-outlined">person</span><span>Profile</span>
          </button>
        </nav>
      </aside>

      {/* Main */}
      <main className="md:ml-64 flex-1 min-h-screen">
        <header className="flex justify-between items-center px-8 py-4 bg-[#f7f9fb]/50 backdrop-blur-md sticky top-0 z-40">
          <h2 className="font-bold text-2xl text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>Profile</h2>
        </header>

        <div className="px-8 pb-12 max-w-2xl">
          {/* Avatar & Name */}
          <div className="flex items-center gap-6 mb-10 mt-4">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt={displayName}
                className="w-20 h-20 rounded-full border-4 border-[#86f2e4]/30 shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-full premium-gradient flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                {avatarLetter}
              </div>
            )}
            <div>
              <h3 className="text-2xl font-extrabold text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>{displayName}</h3>
              <p className="text-[#43474d] text-sm">{user?.email || "Guest"}</p>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#e6e8ea]/50">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#006a61]">badge</span>
                <span className="text-xs font-bold uppercase tracking-widest text-[#43474d]">Account</span>
              </div>
              <p className="text-[#002542] font-semibold">{provider}</p>
              <p className="text-xs text-[#73777e] mt-1">Sign-in method</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#e6e8ea]/50">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#006a61]">calendar_today</span>
                <span className="text-xs font-bold uppercase tracking-widest text-[#43474d]">Member Since</span>
              </div>
              <p className="text-[#002542] font-semibold">{createdAt}</p>
              <p className="text-xs text-[#73777e] mt-1">Account created</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#e6e8ea]/50">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#006a61]">bookmark</span>
                <span className="text-xs font-bold uppercase tracking-widest text-[#43474d]">Saved Trips</span>
              </div>
              <p className="text-[#002542] font-semibold text-2xl">{savedCount}</p>
              <p className="text-xs text-[#73777e] mt-1">Trip briefs saved</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#e6e8ea]/50">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#006a61]">verified_user</span>
                <span className="text-xs font-bold uppercase tracking-widest text-[#43474d]">Status</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <p className="text-[#002542] font-semibold">Active</p>
              </div>
              <p className="text-xs text-[#73777e] mt-1">Account verified</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={onNewTrip}
              className="w-full premium-gradient text-white py-3.5 rounded-xl font-bold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-sm">add</span>
              Plan a New Trip
            </button>
            <button onClick={handleSignOut}
              className="w-full bg-white text-red-600 py-3.5 rounded-xl font-bold text-sm shadow-sm border border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-sm">logout</span>
              Sign Out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
