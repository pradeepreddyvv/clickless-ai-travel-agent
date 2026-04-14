"use client";

import { useState, useRef } from "react";

interface HeroHomeProps {
  onSubmit: (query: string) => void;
  onShowSaved: () => void;
  onShowProfile: () => void;
  error: string | null;
}

export function HeroHome({ onSubmit, onShowSaved, onShowProfile, error }: HeroHomeProps) {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  // Accumulate final (non-partial) transcript segments
  const finalTranscriptRef = useRef<string>("");

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const stopRecording = () => {
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current?.close();
    processorRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    wsRef.current = null;
    setIsListening(false);
  };

  const toggleVoice = async () => {
    if (isListening) {
      stopRecording();
      return;
    }

    setVoiceError(null);
    finalTranscriptRef.current = "";

    try {
      // 1. Get a short-lived JWT from our server (API key stays server-side)
      const tokenRes = await fetch("/api/speech-token", { method: "POST" });
      if (!tokenRes.ok) throw new Error("Failed to get speech token");
      const { token } = await tokenRes.json();

      // 2. Open WebSocket to Speechmatics real-time API
      const ws = new WebSocket(`wss://eu2.rt.speechmatics.com/v2?jwt=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            message: "StartRecognition",
            audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
            transcription_config: { language: "en", enable_partials: true },
          })
        );
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);

        if (msg.message === "RecognitionStarted") {
          setIsListening(true);
        }

        // Partial results — show live preview
        if (msg.message === "AddPartialTranscript") {
          const partial = (msg.results as Array<{ alternatives?: Array<{ content: string }> }> ?? [])
            .map((r) => r.alternatives?.[0]?.content ?? "")
            .join(" ")
            .trim();
          setQuery(finalTranscriptRef.current + (partial ? " " + partial : ""));
        }

        // Final confirmed segment — append to permanent transcript
        if (msg.message === "AddTranscript") {
          const segment = (msg.results as Array<{ alternatives?: Array<{ content: string }> }> ?? [])
            .map((r) => r.alternatives?.[0]?.content ?? "")
            .join(" ")
            .trim();
          if (segment) {
            finalTranscriptRef.current = (finalTranscriptRef.current + " " + segment).trim();
            setQuery(finalTranscriptRef.current);
          }
        }
      };

      ws.onerror = () => {
        setVoiceError("Speechmatics connection error. Please try again.");
        stopRecording();
      };

      ws.onclose = () => setIsListening(false);

      // 3. Capture microphone at 16 kHz and stream raw PCM Float32 to the WebSocket
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessor gives us raw Float32 PCM chunks — ideal for Speechmatics pcm_f32le
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const pcm = e.inputBuffer.getChannelData(0);
          // Send a copy so the buffer doesn't get recycled before the send completes
          ws.send(new Float32Array(pcm).buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Microphone access denied");
      setIsListening(false);
    }
  };

  const examples = [
    '"5-day trip to Tokyo under $2000"',
    '"Luxury weekend in Paris"',
    '"Family trip to London, museums"',
  ];

  return (
    <>
      {/* Header */}
      <header className="bg-[#f7f9fb]/80 backdrop-blur-md flex justify-between items-center px-8 md:px-12 py-6 w-full fixed top-0 z-50">
        <div className="text-2xl font-extrabold tracking-tight text-[#002542]" style={{ fontFamily: "Manrope, sans-serif" }}>
          ClickLess AI
        </div>
        <nav className="hidden md:flex space-x-10">
          <a className="font-bold text-[#002542] hover:text-[#006a61] transition-colors" href="#">New Trip</a>
          <button className="text-[#43474d] font-medium hover:text-[#006a61] transition-colors" onClick={onShowSaved}>Saved Trips</button>
        </nav>
        <button onClick={onShowProfile} className="flex items-center gap-2 cursor-pointer text-[#002542] hover:text-[#006a61] transition-colors">
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>account_circle</span>
        </button>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex flex-col items-center pt-32 pb-20 px-6">
          {/* Background Image */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <img
              alt="Serene coastal view"
              className="w-full h-full object-cover scale-105"
              src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80"
            />
            <div className="absolute inset-0 hero-bg-overlay" />
          </div>

          <div className="max-w-5xl mx-auto text-center z-10">
            <h1 className="text-5xl md:text-8xl font-extrabold text-[#002542] tracking-tight leading-[1.05] mb-8" style={{ fontFamily: "Manrope, sans-serif" }}>
              ClickLess AI - Travel<br />Conversational Agent
            </h1>
            <p className="text-xl md:text-2xl text-[#43474d] max-w-2xl mx-auto mb-16 leading-relaxed">
              One utterance to a complete trip brief. Experience the future of intelligent travel planning.
            </p>

            {/* Main Input */}
            <div className="w-full max-w-3xl mx-auto mb-20 group">
              <div className="glass-morphism p-3 rounded-full shadow-2xl shadow-[#002542]/10 border border-white transition-all focus-within:ring-4 focus-within:ring-[#002542]/5">
                <div className="flex items-center gap-4 bg-white/50 rounded-full px-6 py-4">
                  <button
                    onClick={toggleVoice}
                    className={`w-14 h-14 premium-gradient text-white rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-lg flex-shrink-0 ${isListening ? "animate-pulse ring-4 ring-red-300" : ""}`}
                  >
                    <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {isListening ? "mic_off" : "mic"}
                    </span>
                  </button>
                  <input
                    className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-xl font-medium placeholder:text-[#73777e]/60"
                    placeholder="Where should we go next?"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  />
                  <button
                    onClick={handleSubmit}
                    className="hidden md:flex items-center gap-2 text-[#002542] font-bold hover:gap-3 transition-all px-4"
                  >
                    Go <span className="material-symbols-outlined font-bold">arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Example Prompts */}
              <div className="flex flex-wrap justify-center gap-3 mt-8 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-500">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setQuery(ex.replace(/"/g, ""))}
                    className="text-sm font-semibold text-[#43474d]/70 px-4 py-2 bg-white/40 backdrop-blur rounded-full cursor-pointer hover:bg-white/80 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Floating Preview Cards */}
            <div className="relative w-full max-w-4xl mx-auto h-64 mt-12 hidden md:block">
              <div className="absolute left-0 top-0 glass-morphism p-6 rounded-[2rem] shadow-xl border border-white/50 w-72 animate-bounce" style={{ animationDuration: "4s" }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#86f2e4] flex items-center justify-center text-[#006a61]">
                    <span className="material-symbols-outlined">flight</span>
                  </div>
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-widest font-bold opacity-50">Insight</div>
                    <div className="font-bold text-sm">Best Flights Found</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full bg-[#002542]/5 rounded-full" />
                  <div className="h-2 w-2/3 bg-[#002542]/5 rounded-full" />
                </div>
              </div>
              <div className="absolute right-0 bottom-0 glass-morphism p-6 rounded-[2rem] shadow-xl border border-white/50 w-80 animate-bounce" style={{ animationDuration: "5s" }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#d1e4ff] flex items-center justify-center text-[#002542]">
                    <span className="material-symbols-outlined">hotel</span>
                  </div>
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-widest font-bold opacity-50">Curation</div>
                    <div className="font-bold text-sm">Boutique Stays</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-[#002542]/5 overflow-hidden">
                    <img alt="Hotel" className="w-full h-full object-cover" src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60" />
                  </div>
                  <div className="flex-1 py-2">
                    <div className="h-2 w-full bg-[#002542]/5 rounded-full mb-2" />
                    <div className="h-2 w-1/2 bg-[#002542]/5 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-32 px-6 md:px-12 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold text-[#002542] mb-6" style={{ fontFamily: "Manrope, sans-serif" }}>How It Works</h2>
              <div className="w-20 h-1.5 premium-gradient mx-auto rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-24">
              {[
                { icon: "record_voice_over", title: "Speak or type", desc: "Describe your dream journey naturally, just like talking to a personal concierge." },
                { icon: "search_insights", title: "AI gathers sources", desc: "We scan dozens of live providers for flights, stays, and hidden local gems." },
                { icon: "description", title: "Ranked trip brief", desc: "Receive a curated, intelligent summary optimized for your preferences and budget." },
              ].map((step) => (
                <div key={step.icon} className="flex flex-col items-center text-center group">
                  <div className="w-28 h-28 bg-[#f7f9fb] rounded-[2.5rem] flex items-center justify-center text-[#002542] mb-10 shadow-sm border border-[#c3c6ce]/30 transition-transform group-hover:-translate-y-2">
                    <span className="material-symbols-outlined text-5xl">{step.icon}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
                  <p className="text-[#43474d] text-lg leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="py-24 px-6 bg-[#f7f9fb]/50 border-y border-[#c3c6ce]/20">
          <div className="max-w-6xl mx-auto">
            <p className="text-center font-bold text-xs uppercase tracking-[0.3em] mb-12 text-[#73777e]">Powered by Trusted Global Travel Data</p>
            <div className="flex flex-wrap justify-center items-center gap-10 md:gap-20 opacity-40 hover:opacity-100 transition-opacity" style={{ fontFamily: "Manrope, sans-serif" }}>
              {["Google Flights", "Expedia", "Booking.com", "OpenWeather", "SkyScanner"].map((name) => (
                <div key={name} className="font-extrabold text-xl md:text-2xl">{name}</div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-extrabold text-[#002542] mb-12 leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
              Ready for your next adventure?
            </h2>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="premium-gradient text-white px-16 py-6 rounded-full font-bold text-xl shadow-2xl hover:scale-105 hover:shadow-[#002542]/20 active:scale-95 transition-all"
            >
              Start Planning Now
            </button>
          </div>
        </section>

        {/* Voice Error Toast */}
        {voiceError && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 px-6 py-3 rounded-xl shadow-lg text-sm z-50">
            {voiceError}
          </div>
        )}

        {/* Error Toast */}
        {error && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 px-6 py-3 rounded-xl shadow-lg text-sm z-50">
            {error}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="premium-gradient text-white py-12 px-8 text-center md:text-left">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xl font-bold">ClickLess AI</div>
          <div className="flex gap-8 text-sm font-medium opacity-70">
            <a className="hover:opacity-100 transition-opacity" href="#">Privacy Policy</a>
            <a className="hover:opacity-100 transition-opacity" href="#">Terms of Service</a>
            <a className="hover:opacity-100 transition-opacity" href="#">Contact Us</a>
          </div>
          <div className="text-sm opacity-50">© 2025 ClickLess AI. All rights reserved.</div>
        </div>
      </footer>
    </>
  );
}
