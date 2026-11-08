import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "600"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Gilded Ace · Floor review",
  description:
    "Dashboard Royale entry: which slot machines are truly underperforming once exposure, luck and location are accounted for (fictional casino, synthetic data).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link className="brand" href="/">
              <span className="logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" focusable="false">
                  <path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 7 2.6c-.2 2.2-1 3.6-2.5 5.4h7c-1.5-1.8-2.3-3.2-2.5-5.4A4 4 0 0 0 20 13c0-4.5-5-7-8-11z" />
                </svg>
              </span>
              The Gilded Ace
            </Link>
            <SiteNav />
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap footer">
          Fictional casino; synthetic data calibrated to public aggregates (TAMU Datathon · Dashboard Royale). Data
          pipeline and model run on Databricks. <a href="/checks#glossary">What the words mean</a>.
        </footer>
      </body>
    </html>
  );
}
