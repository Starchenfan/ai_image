import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "AI Image Studio",
  description:
    "Multi-service AI image generation workbench. Pick a model, write a prompt, ship an image.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
    >
      <body
        style={
          {
            "--font-sans": GeistSans.style.fontFamily,
            "--font-mono": GeistMono.style.fontFamily,
          } as React.CSSProperties
        }
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
