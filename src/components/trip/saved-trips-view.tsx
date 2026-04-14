"use client";

import { useState, useEffect, useCallback } from "react";
import type { TripBrief } from "@/lib/types";
import { useAuth } from "@/lib/supabase/auth";

interface SavedTripsViewProps {
  onNewTrip: () => void;
  onViewTrip: (trip: TripBrief) => void;
  onShowProfile: () => void;
}

interface LocalSavedTrip extends TripBrief {
  savedAt?: string;
}

export function SavedTripsView({ onNewTrip, onViewTrip, onShowProfile }: SavedTripsViewProps) {
  const { user, session, loading: authLoading } = useAuth();
  const [trips, setTrips] = useState<LocalSavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    setLoading(true);

    // Load from localStorage
    const localTrips: LocalSavedTrip[] = JSON.parse(localStorage.getItem("clickless_saved_trips") || "[]");

    // If authenticated, also load from Supabase and merge
    if (user && session?.access_token) {
      try {
        const res = await fetch("/api/trips", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (data.source === "supabase" && Array.isArray(data.trips)) {
          // Merge: Supabase trips that aren't already in localStorage
          const localIds = new Set(localTrips.map((t) => t.id));
          for (const sp of data.trips) {
            const tripResult = sp.trip_results;
            if (tripResult?.result && !localIds.has(tripResult.id)) {
              localTrips.push({ ...tripResult.result, savedAt: sp.saved_at });
            }
          }
        }
      } catch { /* Supabase unavailable, use localStorage only */ }
    }

    setTrips(localTrips);
    setLoading(false);
  }, [user, session]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleDelete = async (tripId: string) => {
    const updated = trips.filter((t) => t.id !== tripId);
    setTrips(updated);
    localStorage.setItem("clickless_saved_trips", JSON.stringify(updated));

    // Also delete from Supabase if authenticated
    if (user && session?.access_token) {
      fetch(`/api/trips?id=${tripId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
  };

  const getDestImage = (dest: string) => {
    const images: Record<string, string> = {
      Tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&q=60",
      London: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400&q=60",
      Paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&q=60",
      "Cancún": "https://images.unsplash.com/photo-1510097467424-192d713fd8b2?w=400&q=60",
      "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&q=60",
    };
    return images[dest] || "https://images.unsplash.com/photo-1488646472114-61fc8bca5cbb?w=400&q=60";
  };

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
          <button
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full text-[#002542] font-bold bg-white"
            aria-current="page">
            <span className="material-symbols-outlined">bookmark</span><span>Saved Trips</span>
          </button>
          <button onClick={onShowProfile}
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full text-[#43474d] hover:bg-white/50 transition-colors">
            <span className="material-symbols-outlined">person</span><span>Profile</span>
          </button>
        </nav>
        {/* Auth section */}
        <div className="px-6 mb-4">
          {authLoading ? null : user ? (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-[#006a61] flex items-center justify-center text-white text-sm font-bold">
                {user.user_metadata?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#002542] truncate">{user.user_metadata?.full_name || user.email}</p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Main */}
      <main className="md:ml-64 flex-1 min-h-screen">
        <header className="flex justify-between items-center px-8 py-4 bg-[#f7f9fb]/50 backdrop-blur-md sticky top-0 z-40">
          <h2 className="font-bold text-2xl text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>Saved Trips</h2>
          <button onClick={onShowProfile} className="p-2 text-[#43474d] hover:text-[#002542]" aria-label="Profile">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_circle</span>
          </button>
        </header>

        <div className="px-8 pb-12">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <span className="material-symbols-outlined text-4xl text-[#c3c6ce] animate-spin">progress_activity</span>
            </div>
          ) : trips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-24 h-24 bg-[#f2f4f6] rounded-[2rem] flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-5xl text-[#c3c6ce]">bookmark</span>
              </div>
              <h3 className="text-2xl font-bold text-[#002542] mb-3" style={{ fontFamily: "Manrope, sans-serif" }}>No saved trips yet</h3>
              <p className="text-[#43474d] max-w-md mb-8">
                Plan your first trip and save it here for easy access. Your saved trips will appear in this space.
              </p>
              <button onClick={onNewTrip}
                className="premium-gradient text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center gap-2">
                <span className="material-symbols-outlined">add</span>
                Plan Your First Trip
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {trips.map((trip) => (
                <div key={trip.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                  <div className="h-40 relative overflow-hidden">
                    <img src={getDestImage(trip.intent.destination)} alt={trip.intent.destination}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-4">
                      <h3 className="text-white font-bold text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>{trip.intent.destination}</h3>
                      <p className="text-white/70 text-xs">{trip.intent.duration || 5} nights · {trip.intent.travelers || 1} traveler{(trip.intent.travelers || 1) > 1 ? "s" : ""}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(trip.id); }}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-red-500/80 transition-colors"
                      aria-label="Remove saved trip">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-lg font-extrabold text-[#002542]">${trip.budget.total.toLocaleString()}</span>
                      <span className="text-[10px] text-[#43474d]">{trip.savedAt ? new Date(trip.savedAt).toLocaleDateString() : ""}</span>
                    </div>
                    {trip.intent.activities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {trip.intent.activities.slice(0, 3).map((a) => (
                          <span key={a} className="px-2 py-0.5 bg-[#f2f4f6] rounded-full text-[10px] font-semibold text-[#43474d] capitalize">{a}</span>
                        ))}
                      </div>
                    )}
                    <button onClick={() => onViewTrip(trip)}
                      className="w-full premium-gradient text-white py-2.5 rounded-xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform">
                      View Trip Brief
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
