/**
 * Google API helpers for Gmail, Calendar, and Contacts
 * Used by the AI tool-calling system in Assist
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const PEOPLE_BASE = "https://people.googleapis.com/v1";

// ─── Gmail ──────────────────────────────────────────────────────────────────────

export async function searchGmailMessages(
  token: string,
  query: string,
  maxResults = 10
): Promise<{ id: string; threadId: string; snippet: string; subject: string; from: string; date: string }[]> {
  const url = `${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail search failed: ${res.status}`);
  const data = await res.json();
  if (!data.messages?.length) return [];

  // Batch-fetch metadata for each message (limited to maxResults)
  const messages = await Promise.all(
    data.messages.slice(0, maxResults).map(async (m: { id: string }) => {
      try {
        const detail = await fetch(
          `${GMAIL_BASE}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!detail.ok) return null;
        const d = await detail.json();
        const headers = d.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
        return {
          id: d.id,
          threadId: d.threadId,
          snippet: (d.snippet || "").substring(0, 200),
          subject: getHeader("Subject"),
          from: getHeader("From"),
          date: getHeader("Date"),
        };
      } catch { return null; }
    })
  );
  return messages.filter(Boolean) as any[];
}

export async function readGmailMessage(
  token: string,
  messageId: string
): Promise<{ id: string; threadId: string; subject: string; from: string; to: string; date: string; body: string }> {
  const res = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail read failed: ${res.status}`);
  const d = await res.json();
  const headers = d.payload?.headers || [];
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  // Extract body text
  let body = "";
  const extractText = (part: any): string => {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) return part.parts.map(extractText).join("\n");
    return "";
  };
  body = extractText(d.payload || {});
  if (!body && d.snippet) body = d.snippet;

  return {
    id: d.id,
    threadId: d.threadId,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    to: getHeader("To"),
    date: getHeader("Date"),
    body: body.substring(0, 3000),
  };
}

export async function sendGmailMessage(
  token: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const emailContent = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");

  const raw = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await fetch(`${GMAIL_BASE}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: JSON.stringify(err) };
    }
    const result = await res.json();
    return { success: true, messageId: result.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createGmailDraft(
  token: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const emailContent = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");

  const raw = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const draftBody: any = { message: { raw } };
  if (threadId) draftBody.message.threadId = threadId;

  try {
    const res = await fetch(`${GMAIL_BASE}/drafts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(draftBody),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: JSON.stringify(err) };
    }
    const result = await res.json();
    return { success: true, draftId: result.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Google Calendar ────────────────────────────────────────────────────────────

export async function searchGoogleCalendarEvents(
  token: string,
  query?: string,
  timeMin?: string,
  timeMax?: string,
  maxResults = 15
): Promise<{ id: string; summary: string; start: string; end: string; location?: string; description?: string; attendees?: string[] }[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (query) params.set("q", query);
  if (timeMin) params.set("timeMin", timeMin);
  else params.set("timeMin", new Date().toISOString());
  if (timeMax) params.set("timeMax", timeMax);

  const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar search failed: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((e: any) => ({
    id: e.id,
    summary: e.summary || "(No title)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    location: e.location,
    description: e.description?.substring(0, 500),
    attendees: e.attendees?.map((a: any) => a.email).slice(0, 20),
  }));
}

export async function createGoogleCalendarEvent(
  token: string,
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string,
  location?: string,
  attendees?: string[],
  timeZone?: string
): Promise<{ success: boolean; eventId?: string; htmlLink?: string; error?: string }> {
  const eventBody: any = {
    summary,
    start: { dateTime: startDateTime, timeZone: timeZone || undefined },
    end: { dateTime: endDateTime, timeZone: timeZone || undefined },
  };
  if (description) eventBody.description = description;
  if (location) eventBody.location = location;
  if (attendees?.length) eventBody.attendees = attendees.map((email) => ({ email }));

  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: JSON.stringify(err) };
    }
    const result = await res.json();
    return { success: true, eventId: result.id, htmlLink: result.htmlLink };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateGoogleCalendarEvent(
  token: string,
  eventId: string,
  updates: { summary?: string; startDateTime?: string; endDateTime?: string; description?: string; location?: string; attendees?: string[] }
): Promise<{ success: boolean; error?: string }> {
  const body: any = {};
  if (updates.summary) body.summary = updates.summary;
  if (updates.startDateTime) body.start = { dateTime: updates.startDateTime };
  if (updates.endDateTime) body.end = { dateTime: updates.endDateTime };
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.location !== undefined) body.location = updates.location;
  if (updates.attendees) body.attendees = updates.attendees.map((email) => ({ email }));

  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: JSON.stringify(err) };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteGoogleCalendarEvent(
  token: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
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

// ─── Google Tasks ────────────────────────────────────────────────────────────

const TASKS_BASE = "https://tasks.googleapis.com/tasks/v1";

export async function listGoogleTasks(
  token: string,
  maxResults = 20
): Promise<{ id: string; title: string; status: string; due?: string; notes?: string }[]> {
  // Get the default task list first
  const listsRes = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listsRes.ok) throw new Error(`Tasks lists failed: ${listsRes.status}`);
  const listsData = await listsRes.json();
  const defaultList = listsData.items?.[0]?.id;
  if (!defaultList) return [];

  const res = await fetch(`${TASKS_BASE}/lists/${defaultList}/tasks?maxResults=${maxResults}&showCompleted=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Tasks list failed: ${res.status}`);
  const data = await res.json();

  return (data.items || []).filter((t: any) => t.title).map((t: any) => ({
    id: t.id,
    title: t.title,
    status: t.status || "needsAction",
    due: t.due,
    notes: t.notes?.substring(0, 200),
  }));
}

export async function createGoogleTask(
  token: string,
  title: string,
  notes?: string,
  due?: string
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  // Get the default task list
  const listsRes = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listsRes.ok) return { success: false, error: `Tasks lists failed: ${listsRes.status}` };
  const listsData = await listsRes.json();
  const defaultList = listsData.items?.[0]?.id;
  if (!defaultList) return { success: false, error: "No task list found" };

  const taskBody: any = { title };
  if (notes) taskBody.notes = notes;
  if (due) taskBody.due = due; // RFC 3339 date (e.g. 2026-05-24T00:00:00.000Z)

  try {
    const res = await fetch(`${TASKS_BASE}/lists/${defaultList}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(taskBody),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: JSON.stringify(err) };
    }
    const result = await res.json();
    return { success: true, taskId: result.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Google Contacts (People API) ───────────────────────────────────────────────

export async function searchGoogleContacts(
  token: string,
  query: string,
  maxResults = 15
): Promise<{ name: string; email?: string; phone?: string; organization?: string }[]> {
  const params = new URLSearchParams({
    query,
    readMask: "names,emailAddresses,phoneNumbers,organizations",
    pageSize: String(maxResults),
  });

  const res = await fetch(`${PEOPLE_BASE}/people:searchContacts?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Contacts search failed: ${res.status}`);
  const data = await res.json();

  return (data.results || []).map((r: any) => {
    const person = r.person || {};
    return {
      name: person.names?.[0]?.displayName || "Unknown",
      email: person.emailAddresses?.[0]?.value,
      phone: person.phoneNumbers?.[0]?.value,
      organization: person.organizations?.[0]?.name,
    };
  });
}
