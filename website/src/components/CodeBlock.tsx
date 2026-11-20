import { useState } from "react";
import { tokenizeLine } from "../lib/highlight";

type Props = {
  code: string;
  /** Text copied by the button. Defaults to `code`. */
  copyText?: string;
  label: string;
  /** Visible file name in the header. */
  filename?: string;
};

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure context, permissions): the text stays selectable.
    }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={label}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        {copied ? (
          <path d="m3 8.5 3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="5.5" y="5.5" width="7.5" height="8" rx="1.5" />
            <path d="M10.5 3.5v-.2A1.3 1.3 0 0 0 9.2 2H4.3A1.3 1.3 0 0 0 3 3.3v6.4A1.3 1.3 0 0 0 4.3 11h.2" />
          </g>
        )}
      </svg>
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export default function CodeBlock({ code, copyText, label, filename }: Props) {
  const lines = code.split("\n");
  return (
    <figure className="code">
      <figcaption className="code-head">
        <span className="code-file">{filename ?? ""}</span>
        <CopyButton text={copyText ?? code} label={label} />
      </figcaption>
      <pre tabIndex={0} aria-label={label.replace(/^Copy /, "")}>
        <code>
          {lines.map((line, i) => (
            <span className="code-line" key={i}>
              {tokenizeLine(line).map((t, j) => (
                <span className={`tk-${t.kind}`} key={j}>
                  {t.text}
                </span>
              ))}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
