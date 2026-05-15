"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { HeroBackground } from "@/components/HeroBackground";

export default function PrivacyPolicyPage() {
  return (
      <div className="relative min-h-screen text-white">
      <HeroBackground />
      <div className="relative z-10">
        <AppHeader />

        <main className="pt-32 pb-20 px-5 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3 bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
              Privacy Policy
            </h1>
            <p className="text-sm text-white/30 mb-10 tracking-widest uppercase">Last updated: January 20, 2026</p>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="p-8 sm:p-10 space-y-10">

                {[
                  {
                    n: "1", title: "Introduction",
                    body: "HireMindX (\"we\", \"our\", or \"us\") is part of Atlas Infrastructure Group and owned by Atlas Infrastructure Group. The platform is powered by the AIG Engine and is currently running on AIG Engine 3. We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service."
                  },
                  {
                    n: "3", title: "How We Use Your Information",
                    list: [
                      "Provide and maintain our Service",
                      "Personalize your experience and job recommendations",
                      "Process job applications on your behalf",
                      "Send email communications and outreach as requested",
                      "Improve and optimize our Service",
                      "Respond to your inquiries and support requests",
                    ],
                    intro: "We use the information we collect to:"
                  },
                  {
                    n: "4", title: "Data Security",
                    body: "We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet is 100% secure."
                  },
                  {
                    n: "5", title: "Data Sharing",
                    list: [
                      "Service providers who assist in operating our Service",
                      "Employers or recruiters when you apply for jobs through our platform",
                      "Legal authorities when required by law",
                    ],
                    intro: "We do not sell your personal information. We may share your information with:"
                  },
                  {
                    n: "6", title: "Your Rights",
                    list: [
                      "Access your personal data",
                      "Correct inaccurate data",
                      "Delete your data",
                      "Object to or restrict processing",
                      "Data portability",
                      "Withdraw consent",
                    ],
                    intro: "Depending on your location, you may have the right to:"
                  },
                  {
                    n: "7", title: "Cookies",
                    body: "We use cookies and similar tracking technologies to track activity on our Service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent."
                  },
                  {
                    n: "8", title: "Changes to This Policy",
                    body: "We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the \"Last updated\" date."
                  },
                  {
                    n: "9", title: "Contact Us",
                    body: "If you have any questions about this Privacy Policy, please contact us at privacy@hiremindx.com."
                  },
                ].map((s, i, arr) => (
                  <section key={s.n}>
                    <h2 className="text-lg font-bold tracking-tight text-white mb-3">
                      {s.n}. {s.title}
                    </h2>
                    {s.body && <p className="text-white/50 text-sm leading-relaxed">{s.body}</p>}
                    {s.intro && <p className="text-white/50 text-sm leading-relaxed mb-4">{s.intro}</p>}
                    {s.list && (
                      <ul className="space-y-2">
                        {s.list.map((item) => (
                          <li key={item} className="flex items-start gap-3 text-sm text-white/50">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-white/30 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {i < arr.length - 1 && <div className="mt-10 h-px bg-white/[0.05]" />}
                  </section>
                ))}

                {/* Section 2 inline */}
                <section>
                  <h2 className="text-lg font-bold tracking-tight text-white mb-3">2. Information We Collect</h2>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">We may collect the following types of information:</p>
                  <ul className="space-y-2">
                    {[
                      { label: "Personal Information", desc: "Name, email address, and other contact details you provide when creating an account" },
                      { label: "Profile Information", desc: "Resume data, job preferences, skills, and professional experience" },
                      { label: "Usage Data", desc: "Information about how you interact with our Service" },
                      { label: "Device Information", desc: "Browser type, IP address, and device identifiers" },
                    ].map((item) => (
                      <li key={item.label} className="flex items-start gap-3 text-sm text-white/50">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-white/30 shrink-0" />
                        <span><span className="text-white/80 font-medium">{item.label}:</span> {item.desc}</span>
                      </li>
                    ))}
                  </ul>
                </section>

              </div>
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/terms"
                className="text-xs text-white/30 hover:text-white/70 transition-colors tracking-widest uppercase"
              >
                View Terms of Service →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
