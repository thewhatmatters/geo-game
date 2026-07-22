import { useCallback, useEffect, useState } from "react";

/**
 * Save code panel (US-019) — export/import of the full player state, living
 * in the stats area next to the history it protects.
 *
 * Presentational by design: the code string is handed in already encoded and
 * import is delegated upward, so this component never touches storage and the
 * app can refresh the heatmap/trophy map/streak from the same place that
 * wrote them.
 */

/** How long the "COPIED" acknowledgement stays up — matches EndScreen's copy button. */
export const COPY_FEEDBACK_MS = 1800;

export interface SaveCodeImportResult {
  ok: boolean;
  message: string;
}

export interface SaveCodeProps {
  /** The current player state, already encoded (see lib/save). */
  code: string;
  /** Validates + applies a pasted code; returns the message to show. */
  onImport: (code: string) => SaveCodeImportResult;
}

export function SaveCode({ code, onImport }: SaveCodeProps) {
  const [pasted, setPasted] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [result, setResult] = useState<SaveCodeImportResult | null>(null);

  useEffect(() => {
    if (copyState === "idle") return;
    const id = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [copyState]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      // The <pre> above stays selectable — manual copy is the fallback.
      setCopyState("error");
    }
  }, [code]);

  const handleImport = useCallback(() => {
    const outcome = onImport(pasted);
    setResult(outcome);
    if (outcome.ok) setPasted("");
  }, [onImport, pasted]);

  return (
    <div className="save-code" data-testid="save-code">
      <p className="end-screen__kicker" aria-hidden="true">
        // BACKUP — SAVE CODE
      </p>
      <p className="save-code__blurb">
        Your streak, history and trophy map live on this device only. Copy this
        code somewhere safe — pasting it back restores everything.
      </p>
      <pre className="save-code__value" data-testid="save-code-value">
        {code}
      </pre>
      <button
        type="button"
        className="end-screen__copy"
        data-testid="save-code-export"
        onClick={handleCopy}
      >
        {copyState === "copied"
          ? "COPIED"
          : copyState === "error"
            ? "COPY BLOCKED — SELECT ABOVE"
            : "COPY SAVE CODE"}
      </button>

      <label className="save-code__label" htmlFor="save-code-input">
        Restore from a save code
      </label>
      <textarea
        id="save-code-input"
        className="save-code__input"
        data-testid="save-code-input"
        rows={3}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="GEO1.…"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
      />
      <button
        type="button"
        className="end-screen__copy"
        data-testid="save-code-import"
        onClick={handleImport}
      >
        IMPORT
      </button>
      {result ? (
        <p
          className={`save-code__result save-code__result--${result.ok ? "ok" : "error"}`}
          data-testid="save-code-result"
          role="status"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
