import React, { useState, useRef, useEffect, useCallback } from "react";

// 1. Minimalist Thinking Indicator
const TypingIndicator = ({ label }) => (
  <div className="flex items-center gap-3 py-3 text-zinc-400">
    <span className="text-xs font-semibold uppercase tracking-widest">{label} researching</span>
    <div className="flex space-x-1">
      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
    </div>
  </div>
);

// 2. Typewriter Component
const TypewriterMessage = ({ content, triggerScroll }) => {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed(""); 
    let i = 0;
    
    const timer = setInterval(() => {
      setDisplayed(content.substring(0, i + 2));
      i += 2;
      
      if (triggerScroll) triggerScroll();

      if (i >= content.length) {
        clearInterval(timer);
      }
    }, 15);
    
    return () => clearInterval(timer);
  }, [content, triggerScroll]);

  return (
    <span>
      {displayed}
      {displayed.length < content.length && (
        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-zinc-400 animate-pulse"></span>
      )}
    </span>
  );
};


function App() {
  const [topic, setTopic] = useState("Are apology videos effective?");
  const [messages, setMessages] = useState([]);
  const [isDebating, setIsDebating] = useState(false);
  const [finalVerdict, setFinalVerdict] = useState("");
  const [threadId, setThreadId] = useState(`thread_${Date.now()}`);
  
  const [activeThinker, setActiveThinker] = useState(null);

  const abortControllerRef = useRef(null);
  
  const proEndRef = useRef(null);
  const conEndRef = useRef(null);

  const triggerScroll = useCallback(() => {
    proEndRef.current?.scrollIntoView({ behavior: "smooth" });
    conEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    triggerScroll();
  }, [messages, activeThinker, triggerScroll]);

  const proMessages = messages.filter((m) => m.name === "ProAgent");
  const conMessages = messages.filter((m) => m.name === "ConAgent");

  const startDebate = async () => {
    setMessages([]);
    setFinalVerdict("");
    setIsDebating(true);
    setActiveThinker("Pro Researcher");

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

            setMessages((prev) => [...prev, eventData]);
            setActiveThinker(null);

            const typingDuration = eventData.content ? Math.ceil(eventData.content.length / 2) * 15 + 100 : 0;

            if (typingDuration > 0) {
              await new Promise((resolve) => setTimeout(resolve, typingDuration));
            }

            if (!eventData.should_stop) {
              if (eventData.name === "ProAgent") setActiveThinker("Con Researcher");
              else if (eventData.name === "ConAgent") setActiveThinker("The Judge");
              else if (eventData.name === "Judge") setActiveThinker("Pro Researcher");
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));

            if (eventData.verdict) {
              setFinalVerdict(eventData.verdict);
            }

            if (eventData.should_stop) {
              setIsDebating(false);
              setActiveThinker(null);
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
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-200 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-100">
      
      {/* Sleek Top Navigation */}
      <header className="relative flex items-center justify-center px-6 py-5 border-b border-zinc-700/60 bg-zinc-900/90 backdrop-blur-md z-10">
        <h1 className="text-xl sm:text-2xl font-bold tracking-[0.2em] text-white uppercase drop-shadow-sm">Debate Arena</h1>
        <div className="absolute right-6 text-xs font-mono text-zinc-400 hidden sm:block">v1.0 / LangGraph Engine</div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Minimalist Sidebar */}
        <aside className="w-80 bg-zinc-800/30 border-r border-zinc-700/60 p-6 flex flex-col z-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Configuration</h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-300 font-medium">Topic Thesis</label>
              <textarea
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all text-sm leading-relaxed resize-none custom-scrollbar shadow-inner"
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
                className="w-full py-3 bg-white text-zinc-950 font-bold tracking-wide uppercase rounded-lg hover:bg-zinc-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.15)] transition-all text-xs" 
                onClick={startDebate}
              >
                Initialize Debate
              </button>
            ) : (
              <button 
                className="w-full py-3 bg-zinc-800 border border-zinc-600 text-zinc-200 font-bold tracking-wide uppercase rounded-lg hover:bg-zinc-700 transition-all text-xs shadow-sm" 
                onClick={handleInterrupt}
              >
                Halt Execution
              </button>
            )}
          </div>
        </aside>

        {/* Refined Arena */}
        <main className="flex-1 flex flex-col p-8 gap-6 overflow-y-auto bg-zinc-900 relative custom-scrollbar">
          
          {/* Central Judge Status */}
          {activeThinker === "The Judge" && (
            <div className="flex justify-center shrink-0">
               <TypingIndicator label="Arbitrating" />
            </div>
          )}

          <div className="flex flex-1 gap-8 min-h-0">
            {/* Pro Column */}
            <section className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-center pb-4 border-b border-zinc-700/60 mb-4">
                <h2 className="text-base font-bold text-white uppercase tracking-widest border-l-[3px] border-blue-500 pl-3">Proponent</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto flex flex-col gap-5 pr-4 pb-4 custom-scrollbar">
                {proMessages.map((msg, idx) => (
                  <div key={idx} className="p-5 border border-zinc-700/50 bg-zinc-800/40 rounded-xl leading-relaxed text-base text-zinc-200 shadow-sm">
                    <TypewriterMessage content={msg.content} triggerScroll={triggerScroll} />
                  </div>
                ))}
                
                {activeThinker === "Pro Researcher" && <TypingIndicator label="Synthesizing" />}
                <div ref={proEndRef} className="h-2" />
              </div>
            </section>

            {/* Vertical Divider */}
            <div className="w-px bg-gradient-to-b from-zinc-700/80 via-zinc-700/20 to-transparent"></div>

            {/* Con Column */}
            <section className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-center pb-4 border-b border-zinc-700/60 mb-4">
                <h2 className="text-base font-bold text-white uppercase tracking-widest border-l-[3px] border-rose-500 pl-3">Opponent</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto flex flex-col gap-5 pr-4 pb-4 custom-scrollbar">
                {conMessages.map((msg, idx) => (
                  <div key={idx} className="p-5 border border-zinc-700/50 bg-zinc-800/40 rounded-xl leading-relaxed text-base text-zinc-200 shadow-sm">
                    <TypewriterMessage content={msg.content} triggerScroll={triggerScroll} />
                  </div>
                ))}
                
                {activeThinker === "Con Researcher" && <TypingIndicator label="Synthesizing" />}
                <div ref={conEndRef} className="h-2" />
              </div>
            </section>
          </div>

          {/* Elegant Verdict Output */}
          {finalVerdict && (
            <div className="mt-4 border border-zinc-600/60 bg-zinc-800/60 rounded-xl p-6 shrink-0 backdrop-blur-sm relative overflow-hidden shadow-md">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-zinc-400"></div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300 mb-3 ml-2">Final Arbitration</h3>
              <p className="text-white m-0 leading-relaxed text-base ml-2">
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