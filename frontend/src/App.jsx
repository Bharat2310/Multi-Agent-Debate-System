import React, { useState, useRef, useEffect, useCallback } from "react";
import { Copy, Check, ArrowDownToLine } from "lucide-react";

// 1. Sleek Thinking Indicator
const TypingIndicator = ({ label }) => (
  <div className="flex items-center gap-3 py-3 text-zinc-500">
    <span className="text-xs font-semibold uppercase tracking-widest">{label}</span>
    <div className="flex space-x-1">
      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></div>
    </div>
  </div>
);

// 2. Typewriter Component with Citations, Copy Feature & Sanitization
const TypewriterMessage = ({ content, triggerScroll }) => {
  const [displayed, setDisplayed] = useState("");
  const [copied, setCopied] = useState(false);

  // SANITIZATION: Catch leaked tool calls like (Source: tavily_search(...)) and turn them into [1]
  const sanitizedContent = content.replace(/\([Ss]ource[.:]?\s*tavily_search.*?\)\)/g, "[1]");

  useEffect(() => {
    setDisplayed(""); 
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(sanitizedContent.substring(0, i + 2));
      i += 2;
      
      if (triggerScroll) triggerScroll();

      if (i >= sanitizedContent.length) clearInterval(timer);
    }, 15);
    return () => clearInterval(timer);
  }, [sanitizedContent, triggerScroll]);

  const handleCopy = () => {
    navigator.clipboard.writeText(sanitizedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderWithCitations = (text) => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, idx) => {
      if (part.match(/\[\d+\]/)) {
        return (
          <span key={idx} className="relative group/cite inline-flex items-center justify-center w-5 h-5 ml-1 text-[10px] font-bold text-blue-400 bg-blue-900/30 border border-blue-800/50 rounded cursor-help align-super transition-colors hover:bg-blue-800/50">
            {part.replace(/[\[\]]/g, '')}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/cite:block w-48 p-2 text-xs font-normal bg-zinc-800 text-zinc-200 rounded-lg border border-zinc-700 shadow-xl z-50">
              Source retrieved from vector index.
            </span>
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="relative group/message">
      <span>{renderWithCitations(displayed)}</span>
      
      {displayed.length < sanitizedContent.length && (
        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-zinc-400 animate-pulse"></span>
      )}

      {displayed.length === sanitizedContent.length && (
        <button 
          onClick={handleCopy} 
          className="absolute -top-2 -right-2 p-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md opacity-0 group-hover/message:opacity-100 transition-opacity hover:text-white hover:bg-zinc-700 shadow-lg"
          title="Copy argument"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
};

function App() {
  const [topic, setTopic] = useState("The normalization of digital ghosting fundamentally degrades our societal capacity for conflict resolution and accountability, creating a culture of disposable relationships.");
  const [messages, setMessages] = useState([]);
  const [isDebating, setIsDebating] = useState(false);
  const [finalVerdict, setFinalVerdict] = useState("");
  const [threadId, setThreadId] = useState(`thread_${Date.now()}`);
  
  const [activeThinker, setActiveThinker] = useState(null);
  const [statusFeed, setStatusFeed] = useState("SYSTEM IDLE");
  
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);

  const abortControllerRef = useRef(null);
  const proEndRef = useRef(null);
  const conEndRef = useRef(null);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  const triggerScroll = useCallback(() => {
    if (autoScrollRef.current) {
      proEndRef.current?.scrollIntoView({ behavior: "auto" });
      conEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    triggerScroll();
  }, [messages, activeThinker, triggerScroll]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (!isNearBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isNearBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const resumeScroll = () => {
    setAutoScroll(true);
    proEndRef.current?.scrollIntoView({ behavior: "smooth" });
    conEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const proMessages = messages.filter((m) => m.name === "ProAgent");
  const conMessages = messages.filter((m) => m.name === "ConAgent");

  const startDebate = async () => {
    setMessages([]);
    setFinalVerdict("");
    setIsDebating(true);
    setAutoScroll(true);
    setActiveThinker("Pro Researcher");
    setStatusFeed("INITIALIZING THREAD & ALLOCATING AGENTS...");

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("http://localhost:8000/stream_debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          topic: topic,
          force_stop: false,
          is_new: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("Network response was not ok");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const eventData = JSON.parse(line);

            setStatusFeed(`${eventData.name.toUpperCase()} IS GENERATING RESPONSE...`);
            setMessages((prev) => [...prev, eventData]);
            setActiveThinker(null);

            const typingDuration = eventData.content ? Math.ceil(eventData.content.length / 2) * 15 + 100 : 0;

            if (typingDuration > 0) {
              await new Promise((resolve) => setTimeout(resolve, typingDuration));
            }

            if (!eventData.should_stop) {
              if (eventData.name === "ProAgent") {
                setActiveThinker("Con Researcher");
                setStatusFeed("OPPONENT: QUERYING VECTOR INDEX & ANALYZING CLAIMS...");
              } else if (eventData.name === "ConAgent") {
                setActiveThinker("The Judge");
                setStatusFeed("JUDGE: WEIGHING ARGUMENTS & CROSS-REFERENCING FACTS...");
              } else if (eventData.name === "Judge") {
                setActiveThinker("Pro Researcher");
                setStatusFeed("PROPONENT: FORMULATING COUNTER-ARGUMENT...");
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));

            if (eventData.verdict) {
              setFinalVerdict(eventData.verdict);
            }

            if (eventData.should_stop) {
              setIsDebating(false);
              setActiveThinker(null);
              setStatusFeed("SYSTEM IDLE: DEBATE CONCLUDED.");
              return;
            }
          } catch (err) {
            console.error("Error parsing NDJSON:", err);
          }
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Streaming error:", error);
      }
    } finally {
      setIsDebating(false);
      setActiveThinker(null);
      setStatusFeed(abortControllerRef.current?.signal.aborted ? "EXECUTION HALTED BY USER." : "SYSTEM IDLE.");
    }
  };

  const handleInterrupt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsDebating(false);
    setActiveThinker(null);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-zinc-200 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-100">
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>

      <header className="relative flex flex-col items-center justify-center pt-5 pb-3 border-b border-zinc-800/80 bg-[#0a0a0c]/90 backdrop-blur-md z-10">
        <h1 className="text-2xl sm:text-3xl font-light tracking-[0.35em] text-white uppercase drop-shadow-sm font-serif">
          Axiom
        </h1>
        <span className="text-[9px] tracking-[0.4em] text-zinc-500 uppercase font-mono mt-1">
          Neural Debate Engine
        </span>
        
        <div className="absolute bottom-0 translate-y-1/2 px-4 py-1 bg-zinc-900 border border-zinc-700 rounded-full flex items-center gap-2 shadow-lg">
          <div className={`w-1.5 h-1.5 rounded-full ${isDebating ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}></div>
          <span className="text-[10px] font-mono tracking-wider text-zinc-400">{statusFeed}</span>
        </div>

        <div className="absolute right-6 top-6 text-xs font-mono text-zinc-600 hidden sm:block">v2.0 / LangGraph</div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-4">
        
        <aside className="w-80 bg-zinc-900/20 border-r border-zinc-800/80 p-6 flex flex-col z-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Configuration</h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Topic Thesis</label>
              <textarea
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all text-sm leading-relaxed resize-none custom-scrollbar shadow-inner"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isDebating}
                rows={5}
                placeholder="Enter a thesis to debate..."
              />
            </div>
          </div>

          <div className="mt-6">
            {!isDebating ? (
              <button 
                className="w-full py-3 bg-white text-zinc-950 font-bold tracking-[0.15em] uppercase rounded-lg hover:bg-zinc-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all text-xs" 
                onClick={startDebate}
              >
                Initialize Debate
              </button>
            ) : (
              <button 
                className="w-full py-3 bg-zinc-900 border border-zinc-700 text-red-400 font-bold tracking-[0.15em] uppercase rounded-lg hover:bg-zinc-800 hover:text-red-300 transition-all text-xs shadow-sm" 
                onClick={handleInterrupt}
              >
                Halt Execution
              </button>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col p-8 gap-6 overflow-hidden bg-transparent relative">
          
          {!autoScroll && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
              <button 
                onClick={resumeScroll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold tracking-wider uppercase rounded-full shadow-xl backdrop-blur transition-all"
              >
                <ArrowDownToLine size={14} />
                Resume Live Feed
              </button>
            </div>
          )}

          {activeThinker === "The Judge" && (
            <div className="flex justify-center shrink-0">
               <TypingIndicator label="Arbitrating Final Verdict" />
            </div>
          )}

          <div className="flex flex-1 gap-8 min-h-0">
            <section className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-center pb-4 border-b border-zinc-800/80 mb-4">
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-[0.2em] border-l-[3px] border-blue-500 pl-3">Proponent</h2>
              </div>
              
              <div onScroll={handleScroll} className="flex-1 overflow-y-auto flex flex-col gap-5 pr-4 pb-12 custom-scrollbar">
                {proMessages.map((msg, idx) => (
                  <div key={idx} className="p-5 border border-zinc-800/60 bg-zinc-900/40 rounded-xl leading-relaxed text-[15px] text-zinc-300 shadow-sm">
                    <TypewriterMessage content={msg.content} triggerScroll={triggerScroll} />
                  </div>
                ))}
                
                {activeThinker === "Pro Researcher" && <TypingIndicator label="Synthesizing" />}
                <div ref={proEndRef} className="h-2 shrink-0" />
              </div>
            </section>

            <div className="w-px bg-gradient-to-b from-zinc-800/80 via-zinc-800/20 to-transparent"></div>

            <section className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-center pb-4 border-b border-zinc-800/80 mb-4">
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-[0.2em] border-l-[3px] border-rose-500 pl-3">Opponent</h2>
              </div>
              
              <div onScroll={handleScroll} className="flex-1 overflow-y-auto flex flex-col gap-5 pr-4 pb-12 custom-scrollbar">
                {conMessages.map((msg, idx) => (
                  <div key={idx} className="p-5 border border-zinc-800/60 bg-zinc-900/40 rounded-xl leading-relaxed text-[15px] text-zinc-300 shadow-sm">
                    <TypewriterMessage content={msg.content} triggerScroll={triggerScroll} />
                  </div>
                ))}
                
                {activeThinker === "Con Researcher" && <TypingIndicator label="Synthesizing" />}
                <div ref={conEndRef} className="h-2 shrink-0" />
              </div>
            </section>
          </div>

          {finalVerdict && (
            <div className="mt-4 border border-emerald-900/50 bg-emerald-950/20 rounded-xl p-6 shrink-0 backdrop-blur-sm relative overflow-hidden shadow-md">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400 mb-3 ml-2">Final Arbitration</h3>
              <p className="text-zinc-100 m-0 leading-relaxed text-[15px] ml-2">
                <TypewriterMessage content={finalVerdict} triggerScroll={triggerScroll} />
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
