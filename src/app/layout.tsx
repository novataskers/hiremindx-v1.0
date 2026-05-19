import type { Metadata } from "next";
import "./globals.css";
import { UsageLimitModal } from "@/components/UsageLimitModal";
import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.hiremindx.com"),
  title: "HireMindX - Autonomous Intelligence for Professionals",
  description: "HireMindX will find and apply to jobs that match your profile—all on autopilot.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", sizes: "32x32", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "HireMindX - Autonomous Intelligence for Professionals",
    description: "HireMindX will find and apply to jobs that match your profile—all on autopilot.",
    url: "https://www.hiremindx.com",
    siteName: "HireMindX",
    images: [
      {
        url: "/email-logo.png",
        width: 1200,
        height: 630,
        alt: "HireMindX Logo",
      },
    ],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HireMindX - Autonomous Intelligence for Professionals",
    description: "HireMindX will find and apply to jobs that match your profile—all on autopilot.",
    images: ["/email-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('hiremind_theme') || 'dark';
                  document.documentElement.classList.add(theme);
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var DEPLOY_CHECK_INTERVAL = 30000;
                var currentVersion = null;
                var checkVersion = function() {
                  try {
                    fetch('/api/version', { cache: 'no-store' })
                      .then(function(r) { return r.json(); })
                      .then(function(data) {
                        if (!currentVersion) {
                          currentVersion = data.version;
                        } else if (currentVersion !== data.version) {
                          console.log('[deploy-check] New version detected, reloading...');
                          window.location.reload();
                        }
                      })
                      .catch(function() {});
                  } catch (e) {}
                };
                checkVersion();
                setInterval(checkVersion, DEPLOY_CHECK_INTERVAL);
                window.addEventListener('focus', checkVersion);
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <Script
          id="orchids-browser-logs"
          src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts/orchids-browser-logs.js"
          strategy="afterInteractive"
          data-orchids-project-id="1d9a8077-f9db-43a5-90d4-8d4136be1f3f"
        />
        <Providers>
          <ErrorReporter />
          <Script
            src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
            strategy="afterInteractive"
            data-target-origin="*"
            data-message-type="ROUTE_CHANGE"
            data-include-search-params="true"
            data-only-in-iframe="true"
            data-debug="true"
            data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
          />
          {children}
          <Toaster />
          <UsageLimitModal />
          <VisualEditsMessenger />
        </Providers>
      </body>
    </html>
  );
}