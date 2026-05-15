import nodemailer from "nodemailer";

export interface HireMindXEmailNotificationMetadataItem {
  label: string;
  value: string;
}

export interface HireMindXEmailNotificationParams {
  to: string;
  subject?: string;
  title?: string;
  summary?: string;
  previewText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  recipientName?: string | null;
  metadata?: HireMindXEmailNotificationMetadataItem[];
}

export interface HireMindXRenderedEmailTemplate {
  html: string;
  text: string;
  subject: string;
  previewText: string;
}

export interface HireMindXEmailSendResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

interface HireMindXSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  siteUrl: string;
}

const DEFAULT_FROM_EMAIL = "info@atlasinfrastructuregroup.com";
const DEFAULT_FROM_NAME = "HireMindX Notifications";
const DEFAULT_SITE_URL = "http://localhost:3000";

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.replace(/\/$/, "");
}

function resolveUrl(pathOrUrl: string | undefined, siteUrl: string) {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedBase = normalizeSiteUrl(siteUrl);
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${normalizedBase}${normalizedPath}`;
}

const NOTIFICATION_ACCENT = "#D4AF37";

const NOTIFICATION_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="${NOTIFICATION_ACCENT}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="${NOTIFICATION_ACCENT}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

function getSiteUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    DEFAULT_SITE_URL;

  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }
  return normalizeSiteUrl(url);
}

function getSmtpConfig(): HireMindXSmtpConfig {
  const host = process.env.SMTP_HOST || process.env.HOSTINGER_SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || process.env.HOSTINGER_SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.HOSTINGER_SMTP_USER || process.env.HOSTINGER_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.HOSTINGER_SMTP_PASS || process.env.HOSTINGER_EMAIL_PASSWORD;
  const fromEmail =
    process.env.NOTIFICATION_FROM_EMAIL ||
    process.env.HOSTINGER_FROM_EMAIL ||
    user ||
    DEFAULT_FROM_EMAIL;
  const fromName =
    process.env.NOTIFICATION_FROM_NAME ||
    process.env.HOSTINGER_FROM_NAME ||
    DEFAULT_FROM_NAME;

  return {
    host,
    port: Number.isNaN(port) ? 587 : port,
    secure: parseBoolean(process.env.SMTP_SECURE || process.env.HOSTINGER_SMTP_SECURE, false),
    user,
    pass,
    fromEmail,
    fromName,
    replyTo: process.env.NOTIFICATION_REPLY_TO || process.env.HOSTINGER_REPLY_TO || fromEmail,
    siteUrl: getSiteUrl(),
  };
}

export function getHireMindXNotificationBaseUrl() {
  return resolveUrl("/community", getSmtpConfig().siteUrl) as string;
}

const DEFAULT_SUBJECT = "You've got a notification from HireMindX";
const DEFAULT_TITLE = "New Notification";
const DEFAULT_SUMMARY = "You have a new notification from HireMindX Community. Click below to check it out.";
const DEFAULT_CTA_LABEL = "Check notifications";

export function renderHireMindXEmailTemplate(
  params: HireMindXEmailNotificationParams,
): HireMindXRenderedEmailTemplate {
  const config = getSmtpConfig();
  const accent = NOTIFICATION_ACCENT;
  const ctaUrl = resolveUrl(params.ctaUrl || "/community", config.siteUrl) || `${config.siteUrl}/community`;
  const subject = params.subject || DEFAULT_SUBJECT;
  const title = params.title || DEFAULT_TITLE;
  const summary = params.summary || DEFAULT_SUMMARY;
  const ctaLabel = params.ctaLabel || DEFAULT_CTA_LABEL;
  const previewText = params.previewText || summary;
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const safeRecipientName = params.recipientName ? escapeHtml(params.recipientName) : "there";

  const siteUrl = config.siteUrl;

  const metadataHtml = params.metadata?.length
    ? params.metadata
        .map(
          (item, index) => `
            <tr>
              <td style="padding: 14px 20px; color: #888888; font-size: 13px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; letter-spacing: 0.3px; text-transform: uppercase; border-bottom: ${
                index !== params.metadata!.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none"
              };">${escapeHtml(item.label)}</td>
              <td align="right" style="padding: 14px 20px; color: #E8E8E8; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; border-bottom: ${
                index !== params.metadata!.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none"
              };">${escapeHtml(item.value)}</td>
            </tr>`,
        )
        .join("")
    : "";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #0A0A0A; -webkit-font-smoothing: antialiased; }
    img { border: 0; display: block; outline: none; text-decoration: none; }
    p { margin: 0 0 16px 0; }
    a { color: ${accent}; text-decoration: none; }
    a:hover { text-decoration: underline !important; }
    .email-container { width: 100%; max-width: 560px; margin: 0 auto; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-card { padding: 36px 24px !important; }
      .header-pad { padding: 48px 20px 36px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; color: #E0E0E0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preheader text -->
  <div style="display: none; font-size: 1px; color: #0A0A0A; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    ${escapeHtml(previewText)}
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0A0A0A;">
    <tr>
      <td align="center" style="padding: 0 0 64px 0;">
        <table border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 560px; width: 560px; margin: 0 auto;">

          <!-- Header (Logo) -->
          <tr>
            <td align="center" class="header-pad" style="padding: 56px 0 40px 0;">
              <a href="${escapeHtml(siteUrl)}" style="display: inline-block; text-decoration: none;">
                <table border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-right: 10px; vertical-align: middle;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                              <polygon points="12 2 2 7 12 12 22 7" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                              <path d="M2 17l10 5 10-5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                              <path d="M2 12l10 5 10-5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                            </svg>
                          </td>
                          <td style="vertical-align: middle;">
                            <span style="font-size: 14px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.22em; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">HireMindX</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </a>
              <p style="margin: 16px 0 0 0; font-size: 10px; letter-spacing: 0.35em; text-transform: uppercase; color: #555555; font-weight: 600;">Autonomous Intelligence</p>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td align="center" style="padding: 0 12px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #121212; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden;">
                <!-- Decorative top border -->
                <tr>
                  <td style="background: linear-gradient(90deg, ${accent}80 0%, ${accent} 50%, ${accent}80 100%); height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>

                <tr>
                  <td class="content-card" style="padding: 40px 36px;">

                    <!-- Icon Badge -->
                    <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                      <tr>
                        <td style="background-color: ${accent}18; border: 1px solid ${accent}30; border-radius: 12px; padding: 12px;">
                          ${NOTIFICATION_ICON_SVG}
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin: 0 0 20px 0; font-size: 26px; line-height: 1.2; font-weight: 700; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; letter-spacing: -0.01em;">
                      ${safeTitle}
                    </h1>

                    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.5; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                      Hello ${safeRecipientName},
                    </p>

                    <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.7; color: #CCCCCC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                      ${safeSummary}
                    </p>

                    ${
                      metadataHtml
                        ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 32px 0; background-color: #1A1A1A; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
                      ${metadataHtml}
                    </table>`
                        : ""
                    }

                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="padding-top: 8px;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" bgcolor="${accent}" style="border-radius: 10px;">
                                <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display: inline-block; padding: 15px 32px; color: #000000; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; letter-spacing: 0.3px;">
                                  ${escapeHtml(ctaLabel)}
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 20px 0 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 28px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #555555; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                      <strong style="color: #777777; font-weight: 600;">HireMindX</strong> &mdash; Autonomous Intelligence for Professionals
                    </p>
                    <p style="margin: 0; font-size: 11px; line-height: 1.7; color: #444444; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                      &copy; ${new Date().getFullYear()} Atlas Infrastructure Group. Automated notification.<br/>
                      <a href="${escapeHtml(siteUrl)}" style="color: ${accent}; text-decoration: none;">Visit HireMindX</a> <span style="color: #333333;">&middot;</span> <a href="mailto:${escapeHtml(config.fromEmail)}" style="color: #555555; text-decoration: underline;">Support</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "HireMindX",
    "",
    `Hello ${params.recipientName || "there"},`,
    "",
    title,
    summary,
    "",
    ...(params.metadata?.length ? params.metadata.map((item) => `${item.label}: ${item.value}`) : []),
    "",
    `${ctaLabel}: ${ctaUrl}`,
    "",
    "This transactional notification was sent by HireMindX.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html,
    text,
    subject,
    previewText,
  };
}

export async function sendHireMindXEmailNotification(
  params: HireMindXEmailNotificationParams,
): Promise<HireMindXEmailSendResult> {
  const config = getSmtpConfig();

  if (!config.host || !config.user || !config.pass) {
    console.warn("[HireMindX email] SMTP is not fully configured. Skipping email send.", {
      hostConfigured: Boolean(config.host),
      userConfigured: Boolean(config.user),
      passConfigured: Boolean(config.pass),
      to: params.to,
    });

    return {
      success: false,
      skipped: true,
      error: "SMTP is not fully configured",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const rendered = renderHireMindXEmailTemplate(params);
    const info = await transporter.sendMail({
      from: `${config.fromName} <${config.fromEmail}>`,
      replyTo: config.replyTo,
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("[HireMindX email] Failed to send notification email", {
      error,
      to: params.to,
      subject: params.subject,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown email send error",
    };
  }
}

export default sendHireMindXEmailNotification;
