import { useState } from "react";

export interface ShareResultProps {
  shareString: string;
}

/** Renders the spoiler-safe share string with a copy-to-clipboard button. */
export function ShareResult({ shareString }: ShareResultProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(shareString);
    setCopied(true);
  }

  return (
    <div className="share-result">
      <pre data-testid="share-string" className="share-result__text">
        {shareString}
      </pre>
      <button type="button" className="share-result__copy" data-testid="copy-button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
