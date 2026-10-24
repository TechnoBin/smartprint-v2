import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartPrint V2",
  description: "A simple self-service document printing system.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
