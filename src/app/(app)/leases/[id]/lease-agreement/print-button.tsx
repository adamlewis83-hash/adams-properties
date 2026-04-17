"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="text-sm text-blue-600 hover:underline">
      Print / Save as PDF
    </button>
  );
}
