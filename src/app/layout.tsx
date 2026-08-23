import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Zvastra Admin",
    template: "%s · Zvastra Admin",
  },
  description: "Admin console for social posting",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.className} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
