import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: "Wattmérleg",
  description: "Otthoni fogyasztás és napelemes visszatáplálás követése",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wattmérleg", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#137a42", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="hu"><body>{children}<ServiceWorker/></body></html>;
}
