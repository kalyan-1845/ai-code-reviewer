import React, { useState, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";

interface CopyToClipboardButtonProps {
  textToCopy: string;
  className?: string;
  style?: React.CSSProperties;
  showText?: boolean;
}

export default function CopyToClipboardButton({
  textToCopy,
  className = "",
  style = {},
  showText = false,
}: CopyToClipboardButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <>
      <button aria-label="Copy to clipboard"
        type="button"
        onClick={handleCopy}
        className={`inline-flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${className}`}
        style={{
          background: "transparent",
          border: "none",
          color: isCopied ? "#22c55e" : "#9ca3af",
          ...style,
        }}
        title={isCopied ? "Copied!" : "Copy to Clipboard"}
      >
        {isCopied ? (
          <Check size={14} className="text-green-500" />
        ) : (
          <Copy size={14} className="hover:text-blue-500" />
        )}
        {showText && (
          <span style={{ fontSize: "11px", fontWeight: 600 }}>
            {isCopied ? "Copied!" : "Copy"}
          </span>
        )}
      </button>
      <div aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        {isCopied ? "Copied to clipboard" : ""}
      </div>
    </>
  );
}
