import { db } from "@/db";
import { account } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type EmailProvider = "google" | "microsoft";

export interface EmailToken {
  accessToken: string;
  provider: EmailProvider;
}

export async function refreshGoogleToken(refreshToken: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google token refresh failed: ${response.status} ${errorText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error refreshing Google token:", error);
    return null;
  }
}

export async function refreshMicrosoftToken(refreshToken: string) {
  try {
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "openid profile email offline_access https://graph.microsoft.com/Mail.Send",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Microsoft token refresh failed: ${response.status} ${errorText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error refreshing Microsoft token:", error);
    return null;
  }
}

async function getProviderToken(userId: string, providerId: EmailProvider): Promise<string | null> {
  const linkedAccount = await db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, providerId)
    ),
  });

  if (!linkedAccount) return null;

  const tokenExpiry = linkedAccount.accessTokenExpiresAt;
  const isExpired = !tokenExpiry || new Date(tokenExpiry).getTime() - 300000 < Date.now();
  const hasNoAccessToken = !linkedAccount.accessToken;

  if ((isExpired || hasNoAccessToken) && linkedAccount.refreshToken) {
    console.log(`Refreshing ${providerId} token for user ${userId}...`);
    const refreshed = providerId === "google"
      ? await refreshGoogleToken(linkedAccount.refreshToken)
      : await refreshMicrosoftToken(linkedAccount.refreshToken);

    if (refreshed) {
      const updateData: any = {
        accessToken: refreshed.access_token,
        accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        updatedAt: new Date(),
      };
      if (refreshed.refresh_token) {
        updateData.refreshToken = refreshed.refresh_token;
      }
      await db.update(account)
        .set(updateData)
        .where(eq(account.id, linkedAccount.id));

      console.log(`Token successfully refreshed for user ${userId} (${providerId})`);
      return refreshed.access_token;
    } else {
      console.error(`Failed to refresh ${providerId} token for user ${userId}`);
      return null;
    }
  }

  if (!linkedAccount.accessToken || isExpired) return null;
  return linkedAccount.accessToken;
}

/** Get a valid Gmail token (backward-compatible) */
export async function getGmailToken(userId: string): Promise<string | null> {
  return getProviderToken(userId, "google");
}

/** Get a valid email token — prefers the account that can actually send email */
export async function getEmailToken(userId: string): Promise<EmailToken | null> {
  // Check which accounts exist and have email-sending scopes
  const accounts = await db.query.account.findMany({
    where: eq(account.userId, userId),
  });

  const googleAccount = accounts.find(a => a.providerId === "google");
  const microsoftAccount = accounts.find(a => a.providerId === "microsoft");

  const googleCanSend = googleAccount?.scope?.includes("gmail.send") ?? false;
  // Microsoft scope stored by better-auth may not reflect actual granted scopes
  // (better-auth doesn't update scope on re-login). Since our auth config always
  // requests Mail.Send, trust that Microsoft accounts have it if the account exists.
  const microsoftCanSend = !!microsoftAccount;

  console.log(`[EmailToken] User ${userId} — Google account: ${!!googleAccount} (canSend: ${googleCanSend}), Microsoft account: ${!!microsoftAccount} (canSend: ${microsoftCanSend}), MS scope: ${microsoftAccount?.scope}`);

  // Prefer the provider that can actually send email
  // Microsoft is preferred when available since its scope is always requested
  if (microsoftCanSend) {
    const msToken = await getProviderToken(userId, "microsoft");
    if (msToken) {
      console.log(`[EmailToken] Using Microsoft provider for user ${userId}`);
      return { accessToken: msToken, provider: "microsoft" };
    }
  }

  if (googleCanSend) {
    const googleToken = await getProviderToken(userId, "google");
    if (googleToken) {
      console.log(`[EmailToken] Using Google provider for user ${userId}`);
      return { accessToken: googleToken, provider: "google" };
    }
  }

  console.warn(`[EmailToken] No valid email token found for user ${userId}`);
  return null;
}
