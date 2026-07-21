import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "JAM Property Management",
  description: "Property management dashboard",
  appleWebApp: {
    capable: true,
    title: "JAM",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#14213d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script runs before hydration so we never flash the wrong
  // theme or briefly reveal blurred values. Reads `theme` and `privacy`
  // from localStorage.
  const themeBoot = `(()=>{try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var p=localStorage.getItem('privacy');if(p==='hidden')document.documentElement.dataset.privacy='hidden';}catch(e){}})();`;
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${plexMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
