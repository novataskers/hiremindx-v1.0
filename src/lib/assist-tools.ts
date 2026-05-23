/**
 * Unified AI tool definitions for Assist
 * Routes to Google or Microsoft APIs based on user's connected provider
 */

import { tool } from "ai";
import { z } from "zod";
import type { EmailProvider } from "@/lib/google-auth";
import {
  searchGmailMessages,
  readGmailMessage,
  sendGmailMessage,
  createGmailDraft,
  searchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  searchGoogleContacts,
} from "@/lib/google-tools";
import {
  searchOutlookMessages,
  readOutlookMessage,
  sendOutlookMessage,
  createOutlookDraft,
  searchOutlookCalendarEvents,
  createOutlookCalendarEvent,
  updateOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
  searchOutlookContacts,
} from "@/lib/microsoft-tools";

export function createAssistTools(accessToken: string, provider: EmailProvider) {
  return {
    searchEmails: tool({
      description:
        "Search and read emails in the user's inbox (Gmail or Outlook). Use this when the user asks about their emails, wants to find a specific message, or asks 'did I get an email from X?'. Returns a list of matching emails with subject, sender, date, and preview.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Search query — e.g. 'from:john invoice', 'subject:meeting', 'is:unread', or any keyword"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of emails to return (default 8)"),
        readFullMessage: z
          .string()
          .optional()
          .describe("If provided, read the full body of this specific message ID instead of searching"),
      }),
      execute: async ({ query, maxResults: _maxResults, readFullMessage }) => {
        const maxResults = _maxResults ?? 8;
        try {
          if (readFullMessage) {
            const msg =
              provider === "google"
                ? await readGmailMessage(accessToken, readFullMessage)
                : await readOutlookMessage(accessToken, readFullMessage);
            return { type: "full_message" as const, message: msg };
          }
          const messages =
            provider === "google"
              ? await searchGmailMessages(accessToken, query, maxResults)
              : await searchOutlookMessages(accessToken, query, maxResults);
          return { type: "search_results" as const, count: messages.length, messages };
        } catch (e) {
          return { type: "error" as const, error: String(e) };
        }
      },
    }),

    searchCalendarEvents: tool({
      description:
        "Search Google Calendar or Outlook Calendar events. Use when the user asks about their schedule, meetings, appointments, or what they have planned for a specific day/week.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Text search within event titles/descriptions — e.g. 'standup', 'dentist', 'team meeting'"),
        timeMin: z
          .string()
          .optional()
          .describe("Start of time range in ISO 8601 format (e.g. '2025-05-23T00:00:00Z'). Defaults to now."),
        timeMax: z
          .string()
          .optional()
          .describe("End of time range in ISO 8601 format (e.g. '2025-05-24T23:59:59Z')"),
        maxResults: z.number().optional().describe("Max events to return (default 15)"),
      }),
      execute: async ({ query, timeMin, timeMax, maxResults: _maxResults }) => {
        const maxResults = _maxResults ?? 15;
        try {
          const events =
            provider === "google"
              ? await searchGoogleCalendarEvents(accessToken, query, timeMin, timeMax, maxResults)
              : await searchOutlookCalendarEvents(accessToken, query, timeMin, timeMax, maxResults);
          return { count: events.length, events };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    updateCalendarEvents: tool({
      description:
        "Create, update, or delete calendar events. Use when the user wants to schedule a meeting, change an event time, add attendees, or remove an event.",
      inputSchema: z.object({
        action: z.enum(["create", "update", "delete"]).describe("The action to perform"),
        eventId: z
          .string()
          .optional()
          .describe("Event ID — required for update and delete actions. Get this from searchCalendarEvents first."),
        summary: z.string().optional().describe("Event title/summary (required for create)"),
        startDateTime: z
          .string()
          .optional()
          .describe("Start date-time in ISO 8601 (required for create, optional for update)"),
        endDateTime: z
          .string()
          .optional()
          .describe("End date-time in ISO 8601 (required for create, optional for update)"),
        description: z.string().optional().describe("Event description/notes"),
        location: z.string().optional().describe("Event location"),
        attendees: z
          .array(z.string())
          .optional()
          .describe("List of attendee email addresses"),
      }),
      execute: async ({ action, eventId, summary, startDateTime, endDateTime, description, location, attendees }) => {
        try {
          if (action === "create") {
            if (!summary || !startDateTime || !endDateTime) {
              return { error: "summary, startDateTime, and endDateTime are required to create an event" };
            }
            const result =
              provider === "google"
                ? await createGoogleCalendarEvent(accessToken, summary, startDateTime, endDateTime, description, location, attendees)
                : await createOutlookCalendarEvent(accessToken, summary, startDateTime, endDateTime, description, location, attendees);
            return result;
          }
          if (action === "update") {
            if (!eventId) return { error: "eventId is required to update an event" };
            const result =
              provider === "google"
                ? await updateGoogleCalendarEvent(accessToken, eventId, { summary, startDateTime, endDateTime, description, location, attendees })
                : await updateOutlookCalendarEvent(accessToken, eventId, { summary, startDateTime, endDateTime, description, location, attendees });
            return result;
          }
          if (action === "delete") {
            if (!eventId) return { error: "eventId is required to delete an event" };
            const result =
              provider === "google"
                ? await deleteGoogleCalendarEvent(accessToken, eventId)
                : await deleteOutlookCalendarEvent(accessToken, eventId);
            return result;
          }
          return { error: "Invalid action" };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    sendEmail: tool({
      description:
        "Send an email on behalf of the user. Use when the user explicitly asks to send or forward an email to someone. Always confirm the recipient and content before sending.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body text"),
      }),
      execute: async ({ to, subject, body }) => {
        try {
          const result =
            provider === "google"
              ? await sendGmailMessage(accessToken, to, subject, body)
              : await sendOutlookMessage(accessToken, to, subject, body);
          return result;
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    }),

    draftReply: tool({
      description:
        "Draft a reply to an email thread. This saves a draft in the user's email — it does NOT send it. Use when the user wants to prepare a reply but not send it immediately.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address for the reply"),
        subject: z.string().describe("Email subject (usually 'Re: original subject')"),
        body: z.string().describe("Reply body text"),
        threadId: z
          .string()
          .optional()
          .describe("Thread/conversation ID to reply to. Get from searchEmails results."),
      }),
      execute: async ({ to, subject, body, threadId }) => {
        try {
          const result =
            provider === "google"
              ? await createGmailDraft(accessToken, to, subject, body, threadId)
              : await createOutlookDraft(accessToken, to, subject, body, threadId);
          return result;
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    }),

    searchContacts: tool({
      description:
        "Search the user's contacts or directory. Use when the user asks to look up someone's contact info, email address, or phone number.",
      inputSchema: z.object({
        query: z.string().describe("Name or keyword to search for in contacts"),
        maxResults: z.number().optional().describe("Maximum contacts to return (default 10)"),
      }),
      execute: async ({ query, maxResults: _maxResults }) => {
        const maxResults = _maxResults ?? 10;
        try {
          const contacts =
            provider === "google"
              ? await searchGoogleContacts(accessToken, query, maxResults)
              : await searchOutlookContacts(accessToken, query, maxResults);
          return { count: contacts.length, contacts };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  };
}
