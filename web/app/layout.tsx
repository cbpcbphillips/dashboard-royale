import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
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
            <a className="brand" href="/">
              <span className="logo" aria-hidden="true">A</span>
              The Gilded Ace
            </a>
            <SiteNav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap footer">
          Fictional casino; synthetic data calibrated to public aggregates (TAMU Datathon · Dashboard Royale). Data
          pipeline and model run on Databricks.
        </footer>
      </body>
    </html>
  );
}
