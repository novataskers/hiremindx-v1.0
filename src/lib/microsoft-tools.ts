/**
 * Microsoft Graph API helpers for Outlook Mail, Calendar, and Contacts
 * Used by the AI tool-calling system in Assist
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";

// ─── Outlook Mail ───────────────────────────────────────────────────────────────

export async function searchOutlookMessages(
  token: string,
  query: string,
  maxResults = 10
): Promise<{ id: string; conversationId: string; snippet: string; subject: string; from: string; date: string }[]> {
  const params = new URLSearchParams({
    $search: `"${query}"`,
    $top: String(maxResults),
    $select: "id,conversationId,subject,from,receivedDateTime,bodyPreview",
    $orderby: "receivedDateTime desc",
  });

  const res = await fetch(`${GRAPH_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Outlook search failed: ${res.status}`);
  const data = await res.json();

  return (data.value || []).map((m: any) => ({
    id: m.id,
    conversationId: m.conversationId || "",
    snippet: (m.bodyPreview || "").substring(0, 200),
    subject: m.subject || "",
    from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || "",
    date: m.receivedDateTime || "",
  }));
}

export async function readOutlookMessage(
  token: string,
  messageId: string
): Promise<{ id: string; conversationId: string; subject: string; from: string; to: string; date: string; body: string }> {
  const res = await fetch(`${GRAPH_BASE}/messages/${messageId}?$select=id,conversationId,subject,from,toRecipients,receivedDateTime,body`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Outlook read failed: ${res.status}`);
  const m = await res.json();

  return {
    id: m.id,
    conversationId: m.conversationId || "",
    subject: m.subject || "",
    from: m.from?.emailAddress?.address || "",
    to: (m.toRecipients || []).map((r: any) => r.emailAddress?.address).join(", "),
    date: m.receivedDateTime || "",
    body: (m.body?.content || "").substring(0, 3000),
  };
}

export async function sendOutlookMessage(
  token: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const mailBody = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };

  try {
    const res = await fetch(`${GRAPH_BASE}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(mailBody),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createOutlookDraft(
  token: string,
  to: string,
  subject: string,
  body: string,
  conversationId?: string
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  // If replying to a conversation, find the latest message and create a reply draft
  if (conversationId) {
    try {
      // Find the latest message in this conversation
      const searchRes = await fetch(
        `${GRAPH_BASE}/messages?$filter=conversationId eq '${conversationId}'&$top=1&$orderby=receivedDateTime desc&$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const latestId = searchData.value?.[0]?.id;
        if (latestId) {
          const replyRes = await fetch(`${GRAPH_BASE}/messages/${latestId}/createReply`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ comment: body }),
          });
          if (replyRes.ok) {
            const draft = await replyRes.json();
            return { success: true, draftId: draft.id };
          }
        }
      }
    } catch {}
  }

  // Fallback: create a new draft message
  const draftBody = {
    subject,
    body: { contentType: "Text", content: body },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  try {
    const res = await fetch(`${GRAPH_BASE}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(draftBody),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    const result = await res.json();
    return { success: true, draftId: result.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Outlook Calendar ───────────────────────────────────────────────────────────

export async function searchOutlookCalendarEvents(
  token: string,
  query?: string,
  timeMin?: string,
  timeMax?: string,
  maxResults = 15
): Promise<{ id: string; summary: string; start: string; end: string; location?: string; description?: string; attendees?: string[] }[]> {
  const startTime = timeMin || new Date().toISOString();
  // Default to 30 days ahead if no end time
  const endTime = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    startDateTime: startTime,
    endDateTime: endTime,
    $top: String(maxResults),
    $orderby: "start/dateTime",
    $select: "id,subject,start,end,location,bodyPreview,attendees",
  });

  // Use calendarView for time-range queries
  let url = `${GRAPH_BASE}/calendarView?${params}`;

  // If there's a text query, use events endpoint with filter instead
  if (query) {
    const filterParams = new URLSearchParams({
      $filter: `contains(subject,'${query.replace(/'/g, "''")}')`,
      $top: String(maxResults),
      $orderby: "start/dateTime",
      $select: "id,subject,start,end,location,bodyPreview,attendees",
    });
    url = `${GRAPH_BASE}/events?${filterParams}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Outlook calendar search failed: ${res.status}`);
  const data = await res.json();

  return (data.value || []).map((e: any) => ({
    id: e.id,
    summary: e.subject || "(No title)",
    start: e.start?.dateTime || "",
    end: e.end?.dateTime || "",
    location: e.location?.displayName,
    description: (e.bodyPreview || "").substring(0, 500),
    attendees: (e.attendees || []).map((a: any) => a.emailAddress?.address).filter(Boolean).slice(0, 20),
  }));
}

export async function createOutlookCalendarEvent(
  token: string,
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string,
  location?: string,
  attendees?: string[]
): Promise<{ success: boolean; eventId?: string; webLink?: string; error?: string }> {
  const eventBody: any = {
    subject: summary,
    start: { dateTime: startDateTime, timeZone: "UTC" },
    end: { dateTime: endDateTime, timeZone: "UTC" },
  };
  if (description) eventBody.body = { contentType: "Text", content: description };
  if (location) eventBody.location = { displayName: location };
  if (attendees?.length) eventBody.attendees = attendees.map((email) => ({
    emailAddress: { address: email },
    type: "required",
  }));

  try {
    const res = await fetch(`${GRAPH_BASE}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    const result = await res.json();
    return { success: true, eventId: result.id, webLink: result.webLink };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateOutlookCalendarEvent(
  token: string,
  eventId: string,
  updates: { summary?: string; startDateTime?: string; endDateTime?: string; description?: string; location?: string; attendees?: string[] }
): Promise<{ success: boolean; error?: string }> {
  const body: any = {};
  if (updates.summary) body.subject = updates.summary;
  if (updates.startDateTime) body.start = { dateTime: updates.startDateTime, timeZone: "UTC" };
  if (updates.endDateTime) body.end = { dateTime: updates.endDateTime, timeZone: "UTC" };
  if (updates.description !== undefined) body.body = { contentType: "Text", content: updates.description };
  if (updates.location !== undefined) body.location = { displayName: updates.location };
  if (updates.attendees) body.attendees = updates.attendees.map((email) => ({
    emailAddress: { address: email },
    type: "required",
  }));

  try {
    const res = await fetch(`${GRAPH_BASE}/events/${eventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteOutlookCalendarEvent(
  token: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      return { success: false, error: `Delete failed: ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Outlook Contacts ───────────────────────────────────────────────────────────

export async function searchOutlookContacts(
  token: string,
  query: string,
  maxResults = 15
): Promise<{ name: string; email?: string; phone?: string; organization?: string }[]> {
  const params = new URLSearchParams({
    $search: `"${query}"`,
    $top: String(maxResults),
    $select: "displayName,emailAddresses,businessPhones,mobilePhone,companyName",
  });

  const res = await fetch(`${GRAPH_BASE}/contacts?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Outlook contacts search failed: ${res.status}`);
  const data = await res.json();

  return (data.value || []).map((c: any) => ({
    name: c.displayName || "Unknown",
    email: c.emailAddresses?.[0]?.address,
    phone: c.businessPhones?.[0] || c.mobilePhone,
    organization: c.companyName,
  }));
}
