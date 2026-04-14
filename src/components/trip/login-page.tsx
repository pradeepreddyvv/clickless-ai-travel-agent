"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/auth";

interface LoginPageProps {
  onSkip: () => void;
}

export function LoginPage({ onSkip }: LoginPageProps) {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError(null);

    if (mode === "login") {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setError(result.error);
        setLoading(false);
      }
    } else {
      const result = await signUpWithEmail(email, password, name);
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        setSuccess("Check your email to confirm your account, then sign in.");
        setMode("login");
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fb] flex">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            alt="Travel inspiration"
            className="w-full h-full object-cover"
            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#002542]/90 to-[#006a61]/80" />
        </div>
        <div className="p-12 relative z-10">
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: "Manrope, sans-serif" }}>ClickLess AI</h1>
          <p className="text-white/60 text-sm mt-1">Digital Concierge</p>
        </div>
        <div className="p-12 relative z-10">
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>
            One utterance to a<br />complete trip brief.
          </h2>
          <p className="text-white/70 text-lg max-w-md">
            Speak or type your dream journey. Our AI gathers sources, compares options, and delivers a ranked trip brief — all in seconds.
          </p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10 text-center">
            <h1 className="text-2xl font-black text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>ClickLess AI</h1>
            <p className="text-[#43474d] text-sm">Digital Concierge</p>
          </div>

          <h2 className="text-3xl font-extrabold text-[#002542] mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-[#43474d] mb-8">
            {mode === "login" ? "Sign in to access your saved trips and preferences." : "Start planning smarter trips with AI."}
          </p>

          {/* Email/Password Form */}
          <div className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#43474d] mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 rounded-xl border border-[#e6e8ea] bg-white focus:ring-2 focus:ring-[#006a61]/20 focus:border-[#006a61] outline-none transition-all text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#43474d] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-[#e6e8ea] bg-white focus:ring-2 focus:ring-[#006a61]/20 focus:border-[#006a61] outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#43474d] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => { if (e.key === "Enter") handleEmailSubmit(); }}
                className="w-full px-4 py-3 rounded-xl border border-[#e6e8ea] bg-white focus:ring-2 focus:ring-[#006a61]/20 focus:border-[#006a61] outline-none transition-all text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span> {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 text-green-700 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span> {success}
              </div>
            )}

            <button
              onClick={handleEmailSubmit}
              disabled={loading}
              className="w-full premium-gradient text-white py-3.5 rounded-xl font-bold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>

          {/* Toggle mode */}
          <p className="text-center text-sm text-[#43474d] mt-6">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setSuccess(null); }}
              className="text-[#006a61] font-bold hover:underline">
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>

          {/* Skip */}
          <div className="text-center mt-8">
            <button onClick={onSkip} className="text-xs text-[#73777e] hover:text-[#002542] transition-colors underline underline-offset-2">
              Continue without signing in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
