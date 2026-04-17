"use client";

import { useState } from "react";
import { btnGhost } from "@/components/ui";

export function CopyPayLink({ leaseId }: { leaseId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/api/checkout?leaseId=${leaseId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button onClick={handleCopy} className={btnGhost + " text-xs py-1"}>
      {copied ? "Copied!" : "Copy pay link"}
    </button>
  );
}
