import type { Metadata } from "next";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY, THEME_DARK_CLASS } from "@/lib/theme";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Quiver — Marketing Command Center",
  description:
    "An open source, self-hosted, AI-powered marketing command center for product teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          "font-sans antialiased"
        )}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='${THEME_DARK_CLASS}')document.documentElement.classList.add('${THEME_DARK_CLASS}')}catch(e){}})()`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
