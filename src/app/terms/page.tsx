"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { HeroBackground } from "@/components/HeroBackground";

export default function TermsOfServicePage() {
  return (
    <div className="relative min-h-screen text-white">
      <HeroBackground />
      <div className="relative z-10">
        <AppHeader />

        <main className="pt-32 pb-20 px-5 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
              Terms of Service
            </h1>
            <p className="text-sm text-white/30 mb-10 tracking-widest uppercase">Last updated: January 20, 2026</p>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="p-8 sm:p-10 space-y-10">

                {[
                  {
                    n: "1", title: "Acceptance of Terms",
                      body: 'By accessing or using HireMindX ("Service"), you agree to be bound by these Terms of Service. HireMindX is part of Atlas Infrastructure Group and owned by Atlas Infrastructure Group. The Service is powered by the AIG Engine and is currently running on AIG Engine 3. If you do not agree to these terms, please do not use our Service.'
                  },
                  {
                    n: "2", title: "Description of Service",
                    body: "HireMindX is an AI-powered platform that assists users with job searching, applications, email outreach, research, and networking. The Service automates various tasks to help users in their professional endeavors."
                  },
                  {
                    n: "3", title: "User Accounts",
                    body: "To use certain features of the Service, you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account."
                  },
                  {
                    n: "5", title: "Intellectual Property",
                    body: "The Service and its original content, features, and functionality are owned by HireMindX and are protected by international copyright, trademark, and other intellectual property laws."
                  },
                  {
                    n: "6", title: "Limitation of Liability",
                    body: "HireMindX shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service. The Service is provided \"as is\" without warranties of any kind."
                  },
                  {
                    n: "7", title: "Changes to Terms",
                    body: "We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page. Your continued use of the Service after such modifications constitutes acceptance of the updated terms."
                  },
                  {
                    n: "8", title: "Contact Us",
                    body: "If you have any questions about these Terms of Service, please contact us at support@hiremindx.com."
                  },
                ].map((s, i, arr) => (
                  <section key={s.n}>
                    <h2 className="text-lg font-bold tracking-tight text-white mb-3">
                      {s.n}. {s.title}
                    </h2>
                    <p className="text-white/50 text-sm leading-relaxed">{s.body}</p>
                    {i < arr.length - 1 && <div className="mt-10 h-px bg-white/[0.05]" />}
                  </section>
                ))}

                <section>
                  <h2 className="text-lg font-bold tracking-tight text-white mb-3">4. Acceptable Use</h2>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">You agree not to:</p>
                  <ul className="space-y-2">
                    {[
                      "Use the Service for any unlawful purpose",
                      "Violate any applicable laws or regulations",
                      "Infringe upon the rights of others",
                      "Attempt to gain unauthorized access to the Service",
                      "Interfere with or disrupt the Service",
                      "Use automated systems to access the Service in a manner that exceeds reasonable use",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm text-white/50">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-white/30 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

              </div>
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/privacy"
                className="text-xs text-white/30 hover:text-white/70 transition-colors tracking-widest uppercase"
              >
                View Privacy Policy →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
