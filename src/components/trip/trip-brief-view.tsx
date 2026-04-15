"use client";

import { useState, useRef } from "react";
import type { TripBrief } from "@/lib/types";
import { useAuth } from "@/lib/supabase/auth";

interface TripBriefViewProps {
  brief: TripBrief;
  onNewTrip: () => void;
  onShowSaved: () => void;
  onShowProfile: () => void;
  onRefineTrip?: () => void;
}

export function TripBriefView({ brief, onNewTrip, onShowSaved, onShowProfile, onRefineTrip }: TripBriefViewProps) {
  const { user, session } = useAuth();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "itinerary" | "compare">("overview");
  const [activeNav, setActiveNav] = useState("new-trip");
  const [packedItems, setPackedItems] = useState<Set<string>>(new Set());
  const [showAllTips, setShowAllTips] = useState(false);
  const [showAllHotels, setShowAllHotels] = useState(false);
  const [showAllFlights, setShowAllFlights] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const budgetRef = useRef<HTMLDivElement>(null);

  const totalDays = brief.intent.duration || 5;
  const nights = Math.max(totalDays - 1, 1);
  const topFlight = brief.flights[0];
  const topHotel = brief.hotels[0];
  const travelers = brief.intent.travelers || 1;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const toggleReadback = () => {
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(brief.summary);
    u.rate = 0.9;
    u.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
    setIsSpeaking(true);
  };

  const handleSave = async () => {
    try {
      // Always save to localStorage
      const trips = JSON.parse(localStorage.getItem("clickless_saved_trips") || "[]");
      const exists = trips.some((t: TripBrief) => t.id === brief.id);
      if (!exists) {
        trips.unshift({ ...brief, savedAt: new Date().toISOString() });
        localStorage.setItem("clickless_saved_trips", JSON.stringify(trips.slice(0, 20)));
      }
      setSaved(true);
      showToast("Trip saved to your collection!");

      // Also save to Supabase if authenticated
      if (user && session?.access_token) {
        fetch("/api/trips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tripBrief: brief }),
        }).catch(() => { /* silent fallback — localStorage is primary */ });
      }
    } catch { /* storage full or blocked */ }
  };

  const handleShare = async () => {
    const text = `Check out my ${brief.intent.destination} trip plan!\n\n${brief.summary}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${brief.intent.destination} Trip Brief`, text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast("Trip summary copied to clipboard!");
    }
  };

  const handleExport = () => {
    const text = [
      `${brief.intent.destination}: A ${totalDays}-Day Trip`,
      `Budget: $${brief.budget.total}`,
      "",
      "--- FLIGHTS ---",
      ...brief.flights.map((f) => `${f.airline}: $${f.price} (${f.duration}, ${f.stops === 0 ? "nonstop" : f.stops + " stop"})`),
      "",
      "--- HOTELS ---",
      ...brief.hotels.map((h) => `${h.name}: $${h.pricePerNight}/night (${h.rating}★)`),
      "",
      "--- ITINERARY ---",
      ...brief.itinerary.map((d) => `Day ${d.day}: ${d.title}\n${d.activities.map((a) => `  ${a.time} - ${a.activity}`).join("\n")}`),
      "",
      "--- PACKING LIST ---",
      ...brief.packingList.filter((p) => p.priority === "essential").map((p) => `- ${p.item}`),
      "",
      brief.summary,
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief.intent.destination}-trip-brief.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Trip brief exported!");
  };

  const togglePacked = (item: string) => {
    setPackedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  };

  const scrollToBudget = () => {
    budgetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const essentialItems = brief.packingList.filter((p) => p.priority === "essential").slice(0, 6);
  const packedCount = essentialItems.filter((p) => packedItems.has(p.item)).length;

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
            className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full transition-colors ${activeNav === "new-trip" ? "text-[#002542] font-bold bg-white" : "text-[#43474d] hover:bg-white/50"}`}
            aria-current={activeNav === "new-trip" ? "page" : undefined}>
            <span className="material-symbols-outlined">add_circle</span><span>New Trip</span>
          </button>
          {onRefineTrip && (
            <button onClick={onRefineTrip}
              className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full transition-colors text-[#006a61] font-semibold hover:bg-[#86f2e4]/20">
              <span className="material-symbols-outlined">tune</span><span>Refine Trip</span>
            </button>
          )}
          <button onClick={onShowSaved}
            className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full transition-colors ${activeNav === "saved" ? "text-[#002542] font-bold bg-white" : "text-[#43474d] hover:bg-white/50"}`}>
            <span className="material-symbols-outlined">bookmark</span><span>Saved Trips</span>
          </button>
          <button onClick={onShowProfile}
            className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-r-full transition-colors ${activeNav === "profile" ? "text-[#002542] font-bold bg-white" : "text-[#43474d] hover:bg-white/50"}`}>
            <span className="material-symbols-outlined">person</span><span>Profile</span>
          </button>
        </nav>
      </aside>

      {/* Main */}
      <main className="md:ml-64 flex-1 min-h-screen">
        {/* Tab Bar */}
        <header className="flex justify-between items-center px-8 py-4 bg-[#f7f9fb]/50 backdrop-blur-md sticky top-0 z-40">
          <nav role="tablist" aria-label="Trip sections" className="hidden md:flex space-x-6">
            {([
              { key: "overview", label: "Trip Brief" },
              { key: "itinerary", label: "Itinerary" },
              { key: "compare", label: "Compare" },
            ] as const).map((tab) => (
              <button key={tab.key} role="tab" aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`font-semibold transition-colors pb-1 ${activeTab === tab.key ? "text-[#002542] border-b-2 border-[#006a61]" : "text-[#43474d] hover:text-[#002542]"}`}>
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} aria-label="Save trip"
              className={`p-2 rounded-lg transition-colors ${saved ? "text-[#006a61] bg-[#86f2e4]/20" : "text-[#43474d] hover:text-[#002542] hover:bg-[#f2f4f6]"}`}
              title="Save trip">
              <span className="material-symbols-outlined" style={saved ? { fontVariationSettings: "'FILL' 1" } : undefined}>bookmark</span>
            </button>
            <button onClick={handleShare} className="p-2 text-[#43474d] hover:text-[#002542] hover:bg-[#f2f4f6] rounded-lg transition-colors" aria-label="Share trip" title="Share trip">
              <span className="material-symbols-outlined">share</span>
            </button>
            <button onClick={onShowProfile} className="p-2 text-[#43474d] hover:text-[#002542] hover:bg-[#f2f4f6] rounded-lg transition-colors" aria-label="Profile" title="Profile">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_circle</span>
            </button>
          </div>
        </header>

        <div className="px-8 pb-8" role="tabpanel" aria-label={activeTab === "overview" ? "Trip Brief" : activeTab === "itinerary" ? "Itinerary" : "Compare"}>
          {/* Title Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-[#86f2e4] text-[#006a61] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Active Plan</span>
                <span className="text-xs text-[#43474d]">Last updated: Just now</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-[#002542] leading-tight" style={{ fontFamily: "Manrope, sans-serif", textWrap: "balance" }}>
                {brief.intent.destination}
              </h1>
              <p className="text-xl text-[#43474d] mt-1">A {totalDays}-Day Cultural Adventure</p>
            </div>
            <button onClick={scrollToBudget}
              className="bg-white p-6 rounded-2xl shadow-sm text-right hover:shadow-md transition-shadow cursor-pointer group"
              aria-label="View budget breakdown">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#43474d] mb-1">Estimated Budget</p>
              <p className="text-3xl font-extrabold text-[#002542]">
                ${brief.budget.total.toLocaleString()}
                <span className="text-sm font-normal text-[#43474d]"> total</span>
              </p>
              {travelers > 1 && (
                <p className="text-xs text-[#43474d] mt-1">${Math.round(brief.budget.total / travelers).toLocaleString()} per person ({travelers} travelers)</p>
              )}
              <span className="text-[10px] text-[#006a61] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View breakdown ↓</span>
            </button>
          </div>

          {/* ═══════ OVERVIEW TAB ═══════ */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left Column */}
              <div className="lg:col-span-3 space-y-6">
                {/* Best Flight Card */}
                {topFlight && (
                  <div className="bg-white p-6 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-[#002542]">flight</span>
                      <h3 className="font-bold text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>Best Flight</h3>
                      <span className="ml-auto text-[10px] font-bold text-[#43474d]">via {topFlight.source || "Google Flights"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-[#191c1e]">{topFlight.airline}</p>
                        <p className="text-sm text-[#43474d]">{topFlight.origin} → {topFlight.destination} · {topFlight.stops === 0 ? "Nonstop" : `${topFlight.stops} stop`} · {topFlight.duration}</p>
                        <p className="text-xs text-[#43474d] mt-1">Departs {topFlight.departureTime} → Arrives {topFlight.arrivalTime}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-[#002542]">${topFlight.price}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#43474d]">Round Trip</p>
                      </div>
                    </div>
                    <div className="mt-4 bg-[#86f2e4]/20 p-3 rounded-xl">
                      <p className="text-sm text-[#006a61] italic flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                        Best balance of time and price. {topFlight.stops === 0 ? "Nonstop flight." : `${topFlight.stops} stop for savings.`}
                      </p>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button onClick={() => setActiveTab("compare")} className="text-sm font-semibold text-[#006a61] hover:underline flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">compare_arrows</span> See all flights
                      </button>
                    </div>
                  </div>
                )}

                {/* Weather Snapshot */}
                <div className="bg-white p-6 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#002542]">cloud</span>
                      <h3 className="font-bold text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>Weather Snapshot</h3>
                    </div>
                    <span className="text-[10px] text-[#43474d]">Historical average</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {brief.weather.map((w) => {
                      const d = new Date(w.date + "T12:00:00");
                      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
                      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      const iconName = w.condition.toLowerCase().includes("rain") ? "rainy" : w.condition.toLowerCase().includes("cloud") || w.condition.toLowerCase().includes("overcast") ? "cloud" : "sunny";
                      return (
                        <div key={w.date} className="flex-shrink-0 w-20 text-center">
                          <p className="text-[10px] font-bold text-[#43474d] mb-1">{dayLabel}</p>
                          <p className="text-[9px] text-[#73777e] mb-2">{dateLabel}</p>
                          <span className="material-symbols-outlined text-2xl text-[#002542]">{iconName}</span>
                          <p className="text-sm font-bold mt-1">{w.tempHighF}°</p>
                          <p className="text-[10px] text-[#43474d]">{w.rainChance}% rain</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Concierge Intelligence */}
                <div className="premium-gradient p-6 rounded-2xl text-white">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-[#86f2e4]">auto_awesome</span>
                    <h3 className="font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>Concierge Intelligence</h3>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Destination Norms</p>
                    {brief.culturalTips.slice(0, showAllTips ? 7 : 3).map((tip, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[#86f2e4] text-sm mt-0.5">info</span>
                        <div>
                          <p className="text-sm text-white/90">{tip.tip}</p>
                          <p className="text-[10px] text-white/40 uppercase mt-0.5">{tip.category}</p>
                        </div>
                      </div>
                    ))}
                    {brief.culturalTips.length > 3 && (
                      <button onClick={() => setShowAllTips(!showAllTips)} className="text-xs text-[#86f2e4] font-semibold hover:underline mt-2">
                        {showAllTips ? "Show less" : `Show ${brief.culturalTips.length - 3} more tips`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Suggested Itinerary Preview */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[#002542] text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Suggested Itinerary</h3>
                    <button onClick={() => setActiveTab("itinerary")} className="text-sm font-semibold text-[#006a61] hover:underline flex items-center gap-1">
                      View Full Schedule <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {brief.activities.slice(0, 4).map((act) => (
                      <div key={act.id} className="bg-white rounded-2xl overflow-hidden shadow-sm group">
                        <div className="h-32 relative overflow-hidden">
                          <img src={getActivityImage(act.category)} alt={act.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        </div>
                        <div className="p-4">
                          <h4 className="font-bold text-sm mb-1">{act.name}</h4>
                          <p className="text-xs text-[#43474d]">{act.duration || "Half day"} · {act.location}</p>
                          <div className="flex items-center justify-between mt-2">
                            {act.estimatedCost !== undefined && act.estimatedCost > 0 ? (
                              <p className="text-xs text-[#006a61] font-semibold">${act.estimatedCost}</p>
                            ) : (
                              <p className="text-xs text-[#006a61] font-semibold">Free</p>
                            )}
                            <a href={`https://www.google.com/maps/search/${encodeURIComponent(act.name + " " + (act.location || brief.intent.destination))}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-[#43474d] hover:text-[#006a61] flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-xs">map</span> Map
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Hotel Card */}
                {topHotel && (
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                    <div className="h-48 relative overflow-hidden">
                      <img src={getHotelImage(brief.intent.destination)} alt={topHotel.name} className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 left-3 bg-[#86f2e4] text-[#006a61] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                        title={`${Math.round(topHotel.rating * 20)}% match based on your budget, location, and amenity preferences`}>
                        {topHotel.rating}★ · {Math.round(topHotel.rating * 20)}% match
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-bold text-lg mb-1">{topHotel.name}</h3>
                      <p className="text-xs text-[#43474d] mb-3">
                        ${topHotel.pricePerNight}/night · {topHotel.neighborhood || brief.intent.destination}
                        {topHotel.source && <span className="text-[#73777e]"> · via {topHotel.source}</span>}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {topHotel.amenities.slice(0, 4).map((a) => (
                          <span key={a} className="px-2 py-1 bg-[#f2f4f6] rounded-full text-[10px] font-semibold text-[#43474d] flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">{getAmenityIcon(a)}</span> {a}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setActiveTab("compare")}
                          className="flex-1 premium-gradient text-white py-2.5 rounded-xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform text-center">
                          Compare Hotels
                        </button>
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(topHotel.name + " " + (topHotel.neighborhood || brief.intent.destination))}`}
                          target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2.5 bg-[#f2f4f6] rounded-xl text-sm font-semibold text-[#43474d] hover:bg-[#e6e8ea] transition-colors flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">map</span> Map
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Budget Breakdown */}
                <div ref={budgetRef} className="bg-white p-6 rounded-2xl shadow-sm">
                  <h3 className="font-bold text-[#002542] mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Budget Insight</h3>
                  {/* Mini bar chart */}
                  <div className="flex h-3 rounded-full overflow-hidden mb-4">
                    {[
                      { amount: brief.budget.flights, color: "bg-[#002542]" },
                      { amount: brief.budget.hotels, color: "bg-[#006a61]" },
                      { amount: brief.budget.activities, color: "bg-[#86f2e4]" },
                      { amount: brief.budget.food, color: "bg-[#d1e4ff]" },
                      { amount: brief.budget.transport, color: "bg-[#c3c6ce]" },
                    ].map((seg, i) => (
                      <div key={i} className={`${seg.color}`} style={{ width: `${(seg.amount / brief.budget.total) * 100}%` }} />
                    ))}
                  </div>
                  {[
                    { label: `Flights (${topFlight?.price ? `$${topFlight.price}${travelers > 1 ? ` × ${travelers}` : ""}` : "round trip"})`, amount: brief.budget.flights, dot: "bg-[#002542]" },
                    { label: `Hotels (${nights} nights)`, amount: brief.budget.hotels, dot: "bg-[#006a61]" },
                    { label: "Activities", amount: brief.budget.activities, dot: "bg-[#86f2e4]" },
                    { label: "Food & Dining", amount: brief.budget.food, dot: "bg-[#d1e4ff]" },
                    { label: "Transport", amount: brief.budget.transport, dot: "bg-[#c3c6ce]" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#f2f4f6] last:border-0">
                      <span className="text-sm text-[#43474d] flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                        {item.label}
                      </span>
                      <span className="text-sm font-semibold">${item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-2">
                    <span className="font-bold text-[#002542]">Estimated Total</span>
                    <span className="font-extrabold text-[#002542] text-lg">${brief.budget.total.toLocaleString()}</span>
                  </div>
                  {brief.intent.budget && (
                    <p className={`text-xs mt-2 font-semibold ${brief.budget.total <= brief.intent.budget ? "text-[#006a61]" : "text-red-500"}`}>
                      {brief.budget.total <= brief.intent.budget
                        ? `✓ Within your $${brief.intent.budget.toLocaleString()} budget`
                        : `⚠ $${(brief.budget.total - brief.intent.budget).toLocaleString()} over your $${brief.intent.budget.toLocaleString()} budget`}
                    </p>
                  )}
                </div>

                {/* Packing Checklist */}
                <div className="bg-white p-6 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>Packing Essentials</h3>
                    <span className="text-xs text-[#43474d]">{packedCount}/{essentialItems.length} packed</span>
                  </div>
                  <div className="space-y-1">
                    {essentialItems.map((item) => {
                      const isPacked = packedItems.has(item.item);
                      return (
                        <button key={item.item} onClick={() => togglePacked(item.item)}
                          className={`flex items-center gap-2 text-sm w-full text-left py-1.5 px-1 rounded-lg hover:bg-[#f2f4f6] transition-colors ${isPacked ? "opacity-50" : ""}`}>
                          <span className={`material-symbols-outlined text-sm ${isPacked ? "text-[#006a61]" : "text-[#c3c6ce]"}`}
                            style={isPacked ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                            {isPacked ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          <span className={isPacked ? "line-through" : ""}>{item.item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="premium-gradient p-5 rounded-2xl">
                  <h3 className="text-white font-bold mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleSave} aria-label="Save trip"
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors">
                      <span className="material-symbols-outlined text-sm" style={saved ? { fontVariationSettings: "'FILL' 1" } : undefined}>bookmark</span>
                      {saved ? "Saved!" : "Save"}
                    </button>
                    <button onClick={toggleReadback} aria-label={isSpeaking ? "Stop reading" : "Read aloud"}
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors">
                      <span className="material-symbols-outlined text-sm">{isSpeaking ? "stop" : "volume_up"}</span>
                      {isSpeaking ? "Stop" : "Read Aloud"}
                    </button>
                    <button onClick={handleShare} aria-label="Share trip"
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors">
                      <span className="material-symbols-outlined text-sm">share</span> Share
                    </button>
                    <button onClick={handleExport} aria-label="Export trip"
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors">
                      <span className="material-symbols-outlined text-sm">download</span> Export
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ ITINERARY TAB ═══════ */}
          {activeTab === "itinerary" && (
            <div className="max-w-4xl">
              <div className="relative h-56 rounded-2xl overflow-hidden mb-8 shadow-lg">
                <img src={getDestinationHero(brief.intent.destination)} alt={brief.intent.destination} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#002542]/80 to-transparent flex items-end p-8">
                  <div>
                    <span className="bg-[#86f2e4] text-[#006a61] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      {totalDays} Days · {brief.itinerary.reduce((a, d) => a + d.activities.length, 0)} Activities
                    </span>
                    <h2 className="text-3xl font-extrabold text-white mt-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                      {brief.intent.destination} Discovery
                    </h2>
                  </div>
                </div>
              </div>

              {brief.itinerary.map((day) => (
                <div key={day.day} className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 premium-gradient rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {String(day.day).padStart(2, "0")}
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>{day.title}</h3>
                      {day.date && <p className="text-xs text-[#43474d]">{new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</p>}
                    </div>
                  </div>
                  <div className="ml-5 pl-9 border-l-2 border-[#e6e8ea] space-y-4">
                    {day.activities.map((act, i) => (
                      <div key={i} className="bg-white p-5 rounded-2xl shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#43474d] mb-1">{act.time}</p>
                            <h4 className="font-bold text-[#191c1e]">{act.activity}</h4>
                            {act.location && (
                              <a href={`https://www.google.com/maps/search/${encodeURIComponent(act.activity + " " + act.location)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[#43474d] flex items-center gap-1 mt-1 hover:text-[#006a61]">
                                <span className="material-symbols-outlined text-xs">location_on</span> {act.location}
                              </a>
                            )}
                          </div>
                          {act.cost !== undefined && act.cost > 0 && (
                            <span className="text-sm font-bold text-[#006a61]">${act.cost}</span>
                          )}
                        </div>
                        {act.notes && <p className="text-xs text-[#43474d] mt-2">{act.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══════ COMPARE TAB ═══════ */}
          {activeTab === "compare" && (
            <div className="max-w-4xl">
              <div className="mb-6">
                <span className="bg-[#86f2e4] text-[#006a61] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  Top {showAllHotels ? brief.hotels.length : Math.min(5, brief.hotels.length)} of {brief.hotels.length} Hotels for {brief.intent.destination}
                </span>
                <h2 className="text-3xl font-extrabold text-[#002542] mt-3" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Hotel Comparison
                </h2>
                <p className="text-[#43474d] mt-2">Our concierge has filtered the best matches based on your preferences.</p>
              </div>
              <div className="space-y-6">
                {(showAllHotels ? brief.hotels : brief.hotels.slice(0, 5)).map((hotel, i) => (
                  <div key={hotel.id} className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row">
                    <div className="md:w-64 h-48 md:h-auto relative overflow-hidden">
                      <img src={getHotelImage(brief.intent.destination)} alt={hotel.name} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-3 left-3 premium-gradient text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">#1 Match</span>
                      )}
                    </div>
                    <div className="flex-1 p-6">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-xl text-[#002542]">{hotel.name}</h3>
                          <p className="text-xs text-[#43474d] flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">location_on</span>
                            {hotel.neighborhood || brief.intent.destination}
                            {hotel.source && <span className="text-[#73777e] ml-2">via {hotel.source}</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-[#002542]">{Math.round(hotel.rating * 20)}%</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#43474d]">Match Score</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {hotel.amenities.map((a) => (
                          <span key={a} className="px-2 py-1 bg-[#f2f4f6] rounded-full text-[10px] font-semibold text-[#43474d]">{a}</span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xl font-extrabold text-[#002542]">${hotel.pricePerNight}<span className="text-sm font-normal text-[#43474d]"> /night</span></p>
                        <div className="flex gap-2">
                          <a href={`https://www.google.com/maps/search/${encodeURIComponent(hotel.name + " " + (hotel.neighborhood || brief.intent.destination))}`}
                            target="_blank" rel="noopener noreferrer"
                            className="px-4 py-2 bg-[#f2f4f6] rounded-full text-xs font-semibold text-[#43474d] hover:bg-[#e6e8ea] transition-colors flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">map</span> Map
                          </a>
                          <button className="premium-gradient text-white px-5 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-transform">
                            {i === 0 ? "Select this option" : "Compare details"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {brief.hotels.length > 5 && (
                <button
                  onClick={() => setShowAllHotels(!showAllHotels)}
                  className="mt-6 w-full py-3 bg-[#f2f4f6] hover:bg-[#e6e8ea] rounded-xl text-sm font-semibold text-[#002542] transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">{showAllHotels ? "expand_less" : "expand_more"}</span>
                  {showAllHotels ? "Show Top 5 Hotels" : `Show All ${brief.hotels.length} Hotels`}
                </button>
              )}

              {/* Flight Comparison */}
              <div className="mt-12">
                <div className="mb-6">
                  <span className="bg-[#d1e4ff] text-[#002542] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    Top {showAllFlights ? brief.flights.length : Math.min(5, brief.flights.length)} of {brief.flights.length} Flights
                  </span>
                  <h2 className="text-2xl font-extrabold text-[#002542] mt-3" style={{ fontFamily: "Manrope, sans-serif" }}>
                    Flight Options
                  </h2>
                </div>
                <div className="space-y-4">
                  {(showAllFlights ? brief.flights : brief.flights.slice(0, 5)).map((flight, i) => (
                    <div key={flight.id} className={`bg-white p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center gap-4 ${i === 0 ? "ring-1 ring-[#006a61]/20" : ""}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-[#002542]">{flight.airline}</p>
                          {i === 0 && <span className="text-[9px] font-bold uppercase bg-[#86f2e4] text-[#006a61] px-2 py-0.5 rounded-full">Best Value</span>}
                        </div>
                        <p className="text-sm text-[#43474d]">
                          {flight.origin} → {flight.destination} · {flight.stops === 0 ? "Nonstop" : `${flight.stops} stop`} · {flight.duration}
                        </p>
                        <p className="text-xs text-[#73777e] mt-0.5">Departs {flight.departureTime} → Arrives {flight.arrivalTime}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xl font-extrabold text-[#002542]">${flight.price}</p>
                          <p className="text-[10px] text-[#43474d]">round trip · {flight.source}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {brief.flights.length > 5 && (
                  <button
                    onClick={() => setShowAllFlights(!showAllFlights)}
                    className="mt-4 w-full py-3 bg-[#f2f4f6] hover:bg-[#e6e8ea] rounded-xl text-sm font-semibold text-[#002542] transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">{showAllFlights ? "expand_less" : "expand_more"}</span>
                    {showAllFlights ? "Show Top 5 Flights" : `Show All ${brief.flights.length} Flights`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#002542] text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#86f2e4] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          {toastMessage}
        </div>
      )}
    </div>
  );
}

function getActivityImage(category: string): string {
  const images: Record<string, string> = {
    temples: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&q=60",
    "food tours": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=60",
    sightseeing: "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=400&q=60",
    shopping: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&q=60",
    museums: "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400&q=60",
    culture: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&q=60",
    beaches: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=60",
    adventure: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=400&q=60",
  };
  return images[category] || "https://images.unsplash.com/photo-1488646472114-61fc8bca5cbb?w=400&q=60";
}

function getHotelImage(dest: string): string {
  const images: Record<string, string> = {
    Tokyo: "https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=600&q=60",
    London: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=60",
    Paris: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=60",
    "New York": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=60",
    "Cancún": "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=60",
  };
  return images[dest] || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=60";
}

function getDestinationHero(dest: string): string {
  const images: Record<string, string> = {
    Tokyo: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1200&q=60",
    London: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1200&q=60",
    Paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&q=60",
    "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1200&q=60",
    "Cancún": "https://images.unsplash.com/photo-1510097467424-192d713fd8b2?w=1200&q=60",
  };
  return images[dest] || "https://images.unsplash.com/photo-1488646472114-61fc8bca5cbb?w=1200&q=60";
}

function getAmenityIcon(amenity: string): string {
  const icons: Record<string, string> = {
    WiFi: "wifi", Pool: "pool", Spa: "spa", Restaurant: "restaurant",
    Gym: "fitness_center", Breakfast: "free_breakfast", Bar: "local_bar",
    Kitchen: "kitchen", Lounge: "weekend", Laundry: "local_laundry_service",
    "Fitness Center": "fitness_center", "Rooftop Bar": "rooftop_deck",
    "Beach Access": "beach_access", "Co-working": "work", "Yoga Studio": "self_improvement",
    "Smart TV": "tv", "Air Conditioning": "ac_unit", "Luggage Storage": "luggage",
    "24h Front Desk": "concierge", Concierge: "concierge", Garden: "yard",
    Terrace: "deck", Courtyard: "courtyard", Library: "local_library",
    Beach: "beach_access", Parking: "local_parking",
  };
  return icons[amenity] || "check";
}
