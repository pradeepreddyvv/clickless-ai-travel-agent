"use client";

import { useState, useCallback } from "react";
import type { TripBrief } from "@/lib/types";
import { useAuth } from "@/lib/supabase/auth";
import { LoginPage } from "@/components/trip/login-page";
import { HeroHome } from "@/components/trip/hero-home";
import { ConversationalPlanning } from "@/components/trip/conversational-planning";
import { SearchProgress } from "@/components/trip/search-progress";
import { TripBriefView } from "@/components/trip/trip-brief-view";
import { SavedTripsView } from "@/components/trip/saved-trips-view";
import { ProfilePage } from "@/components/trip/profile-page";

type AppState = "login" | "home" | "planning" | "searching" | "results" | "saved" | "profile";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<AppState>("login");
  const [query, setQuery] = useState("");
  const [brief, setBrief] = useState<TripBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedLogin, setSkippedLogin] = useState(false);

  // Once auth loads and user exists, skip login
  const isAuthenticated = !!user || skippedLogin;

  // Show login page if not authenticated and not skipped
  if (!authLoading && !isAuthenticated && state === "login") {
    return <LoginPage onSkip={() => { setSkippedLogin(true); setState("home"); }} />;
  }

  // If user just logged in (auth state changed), go to home
  if (state === "login" && (isAuthenticated || authLoading)) {
    if (!authLoading && isAuthenticated) {
      setState("home");
    }
    if (authLoading) {
      return (
        <div className="min-h-screen bg-[#f7f9fb] flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-[#c3c6ce] animate-spin">progress_activity</span>
        </div>
      );
    }
  }

  const handleSubmit = (q: string) => {
    setQuery(q);
    setError(null);
    setState("planning");
  };

  const handleSearch = async (finalQuery: string) => {
    setQuery(finalQuery);
    setState("searching");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: finalQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setState("planning");
        return;
      }
      setBrief(data);
      setState("results");
    } catch {
      setError("Failed to connect. Please try again.");
      setState("planning");
    }
  };

  const handleNewTrip = () => {
    setState("home");
    setBrief(null);
    setQuery("");
    setError(null);
  };

  const handleShowSaved = () => setState("saved");
  const handleShowProfile = () => {
    // If not logged in (skipped), send back to login
    if (!user) {
      setSkippedLogin(false);
      setState("login");
      return;
    }
    setState("profile");
  };

  const handleViewTrip = (trip: TripBrief) => {
    setBrief(trip);
    setState("results");
  };

  if (state === "home") {
    return <HeroHome onSubmit={handleSubmit} onShowSaved={handleShowSaved} onShowProfile={handleShowProfile} error={error} />;
  }

  if (state === "planning") {
    return (
      <ConversationalPlanning
        query={query}
        onSearch={handleSearch}
        onNewTrip={handleNewTrip}
        onShowSaved={handleShowSaved}
        onShowProfile={handleShowProfile}
        error={error}
      />
    );
  }

  if (state === "searching") {
    return <SearchProgress query={query} />;
  }

  if (state === "results" && brief) {
    return <TripBriefView brief={brief} onNewTrip={handleNewTrip} onShowSaved={handleShowSaved} onShowProfile={handleShowProfile} />;
  }

  if (state === "saved") {
    return <SavedTripsView onNewTrip={handleNewTrip} onViewTrip={handleViewTrip} onShowProfile={handleShowProfile} />;
  }

  if (state === "profile") {
    return <ProfilePage onNewTrip={handleNewTrip} onShowSaved={handleShowSaved} />;
  }

  return null;
}
