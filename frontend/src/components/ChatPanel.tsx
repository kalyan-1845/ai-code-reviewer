import React, { useRef, useEffect } from 'react';
import { Sparkles, FileCode, AlertTriangle, Send } from "lucide-react";
import CopyToClipboardButton from "./CopyToClipboardButton";
import { ChatMessage } from "../store/useStore";

interface ChatPanelProps {
  chatHistory: ChatMessage[];
  isChatLoading: boolean;
  chatInput: string;
  setChatInput: (input: string) => void;
  chatInputEmpty: boolean;
  selectedModel: string;
  sessionId: string | null;
  useRag: boolean;
  setUseRag: (rag: boolean) => void;
  handleSendChatMessage: (e: React.FormEvent) => void;
  renderMarkdown: (md: string) => React.ReactNode;
}

export default function ChatPanel({
  chatHistory, isChatLoading, chatInput, setChatInput, chatInputEmpty,
  selectedModel, sessionId, useRag, setUseRag, handleSendChatMessage, renderMarkdown,
}: ChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatLoading]);

  return (
    <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", boxSizing: "border-box", minHeight: "68vh" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "10px", background: "#a855f7", color: "#fae8ff", padding: "2px 8px", borderRadius: "20px", fontWeight: 600, textTransform: "uppercase" }}>Interactive Chat</span>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#f3f4f6", margin: "4px 0 0 0" }}>Chat with Codebase</h3>
        </div>
        <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
          Active: <strong style={{ color: "#c084fc" }}>{selectedModel.split("-")[0].toUpperCase()}</strong>
        </span>
      </div>

      <div style={{ flexGrow: 1, overflowY: "auto", paddingRight: "4px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "52vh" }}>
        {chatHistory.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: "16px" }}>
            <div style={{ background: "rgba(168, 85, 247, 0.1)", padding: "16px", borderRadius: "50%" }}>
              <Sparkles size={32} style={{ color: "#a855f7" }} />
            </div>
            <div style={{ maxWidth: "400px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#f3f4f6", display: "block", marginBottom: "4px" }}>Ask anything about your repository</span>
              <span style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.5, display: "block" }}>I have parsed the codebase source code. Ask questions like:</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px", width: "100%", maxWidth: "380px", marginTop: "6px" }}>
              {["Explain the overall architecture and setup of this repo.", "What are the main entry points and critical API paths?", "Can you find any security flaws or logic bugs here?", "Write a simple automated test suite for this module structure."].map((queryText, qIdx) => (
                <button key={qIdx} onClick={() => setChatInput(queryText)}
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#d1d5db", cursor: "pointer", textAlign: "left", transition: "all 0.15s ease" }}
                  className="hover:bg-white/5"
                >
                  {queryText}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, index) => (
            <div key={`chat-msg-${index}`} style={{ display: "flex", flexDirection: "column", alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: msg.role === "user" ? "rgba(59, 130, 246, 0.15)" : "rgba(15, 23, 42, 0.4)", border: "1px solid", borderColor: msg.role === "user" ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.05)", borderRadius: msg.role === "user" ? "12px 12px 0 12px" : "12px 12px 12px 0", padding: "10px 14px", boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <span style={{ fontSize: "9px", fontWeight: 700, color: msg.role === "user" ? "#60a5fa" : "#c084fc", textTransform: "uppercase" }}>
                  {msg.role === "user" ? "You" : "RepoSage Assistant"}
                </span>
                <CopyToClipboardButton textToCopy={msg.content} style={{ padding: "2px" }} />
              </div>
              <div style={{ fontSize: "12px", color: "#e5e7eb", lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: msg.role === "assistant" ? "monospace" : "inherit" }}>
                {renderMarkdown(msg.content)}
              </div>
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "6px" }}>
                  {msg.sources.map((source, sIdx) => (
                    <span key={sIdx} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "4px", padding: "2px 6px", color: "#60a5fa" }}>
                      <FileCode size={10} />
                      {source.file}{source.line > 0 ? `:${source.line}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {isChatLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px 12px 12px 0", padding: "10px 14px", gap: "6px", width: "80px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#c084fc", textTransform: "uppercase" }}>RepoSage</span>
            <div style={{ display: "flex", gap: "4px", padding: "2px 0" }}>
              <span className="typing-dot" style={{ width: "5px", height: "5px", background: "#c084fc", borderRadius: "50%", display: "inline-block" }}></span>
              <span className="typing-dot" style={{ width: "5px", height: "5px", background: "#c084fc", borderRadius: "50%", display: "inline-block", animationDelay: "0.2s" }}></span>
              <span className="typing-dot" style={{ width: "5px", height: "5px", background: "#c084fc", borderRadius: "50%", display: "inline-block", animationDelay: "0.4s" }}></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {!sessionId && (
        <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", padding: "8px 12px", marginBottom: "8px", fontSize: "11px", color: "#fbbf24", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={14} />
          <span>Please analyze a repository first to enable codebase-aware chat.</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#9ca3af", cursor: "pointer" }}>
          <input type="checkbox" checked={useRag} onChange={(e) => setUseRag(e.target.checked)} style={{ accentColor: "#a855f7" }} />
          Use RAG context retrieval
        </label>
      </div>
      <form onSubmit={handleSendChatMessage} style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask a question about the codebase files..."
          style={{ flexGrow: 1, background: "rgba(0, 0, 0, 0.2)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px", color: "#f3f4f6", padding: "10px 14px", fontSize: "12px", outline: "none" }}
        />
        <button type="submit" disabled={isChatLoading || chatInputEmpty}
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)", color: "white", border: "none", borderRadius: "6px", padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: isChatLoading || chatInputEmpty ? 0.6 : 1, transition: "opacity 0.15s ease" }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
