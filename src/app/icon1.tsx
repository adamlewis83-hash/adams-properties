import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 190,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "-0.04em",
        }}
      >
        MHR
      </div>
    ),
    { ...size },
  );
}
