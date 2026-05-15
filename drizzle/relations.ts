import { relations } from "drizzle-orm/relations";
import { user, account, jobs, applications, hiringPositions, candidateCvs, chatSessions, chatMessages, clientProjects, communityDms, communityMessages, conversations, communityProfiles, conversationParticipants, resumes, cvAnalysis, cvAnalysisResults, leads, emailCampaigns, examQuestionSessions, freelancerOffers, freelancerPortfolio, hiremindState, interviewQuestionSessions, invitations, jobSearches, predictions, proposals, researchSessions, session, notifications, subscriptions, canvasProjects } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	applications: many(applications),
	chatSessions: many(chatSessions),
	clientProjects: many(clientProjects),
	communityDms_receiverId: many(communityDms, {
		relationName: "communityDms_receiverId_user_id"
	}),
	communityDms_senderId: many(communityDms, {
		relationName: "communityDms_senderId_user_id"
	}),
	communityMessages: many(communityMessages),
	communityProfiles: many(communityProfiles),
	conversationParticipants: many(conversationParticipants),
	cvAnalyses: many(cvAnalysis),
	emailCampaigns: many(emailCampaigns),
	examQuestionSessions: many(examQuestionSessions),
	freelancerOffers: many(freelancerOffers),
	freelancerPortfolios: many(freelancerPortfolio),
	hiremindStates: many(hiremindState),
	hiringPositions: many(hiringPositions),
	interviewQuestionSessions: many(interviewQuestionSessions),
	invitations: many(invitations),
	jobSearches: many(jobSearches),
	leads: many(leads),
	predictions: many(predictions),
	proposals: many(proposals),
	researchSessions: many(researchSessions),
	resumes: many(resumes),
	sessions: many(session),
	notifications: many(notifications),
	subscriptions: many(subscriptions),
	canvasProjects: many(canvasProjects),
}));

export const applicationsRelations = relations(applications, ({one}) => ({
	job: one(jobs, {
		fields: [applications.jobId],
		references: [jobs.id]
	}),
	user: one(user, {
		fields: [applications.userId],
		references: [user.id]
	}),
}));

export const jobsRelations = relations(jobs, ({many}) => ({
	applications: many(applications),
}));

export const candidateCvsRelations = relations(candidateCvs, ({one, many}) => ({
	hiringPosition: one(hiringPositions, {
		fields: [candidateCvs.positionId],
		references: [hiringPositions.id]
	}),
	cvAnalysisResults: many(cvAnalysisResults),
}));

export const hiringPositionsRelations = relations(hiringPositions, ({one, many}) => ({
	candidateCvs: many(candidateCvs),
	cvAnalysisResults: many(cvAnalysisResults),
	user: one(user, {
		fields: [hiringPositions.userId],
		references: [user.id]
	}),
}));

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
	chatSession: one(chatSessions, {
		fields: [chatMessages.sessionId],
		references: [chatSessions.id]
	}),
}));

export const chatSessionsRelations = relations(chatSessions, ({one, many}) => ({
	chatMessages: many(chatMessages),
	user: one(user, {
		fields: [chatSessions.userId],
		references: [user.id]
	}),
}));

export const clientProjectsRelations = relations(clientProjects, ({one, many}) => ({
	user: one(user, {
		fields: [clientProjects.userId],
		references: [user.id]
	}),
	proposals: many(proposals),
}));

export const communityDmsRelations = relations(communityDms, ({one}) => ({
	user_receiverId: one(user, {
		fields: [communityDms.receiverId],
		references: [user.id],
		relationName: "communityDms_receiverId_user_id"
	}),
	user_senderId: one(user, {
		fields: [communityDms.senderId],
		references: [user.id],
		relationName: "communityDms_senderId_user_id"
	}),
}));

export const communityMessagesRelations = relations(communityMessages, ({one}) => ({
	user: one(user, {
		fields: [communityMessages.senderId],
		references: [user.id]
	}),
	conversation: one(conversations, {
		fields: [communityMessages.conversationId],
		references: [conversations.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({many}) => ({
	communityMessages: many(communityMessages),
	conversationParticipants: many(conversationParticipants),
	invitations: many(invitations),
}));

export const communityProfilesRelations = relations(communityProfiles, ({one}) => ({
	user: one(user, {
		fields: [communityProfiles.userId],
		references: [user.id]
	}),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({one}) => ({
	user: one(user, {
		fields: [conversationParticipants.userId],
		references: [user.id]
	}),
	conversation: one(conversations, {
		fields: [conversationParticipants.conversationId],
		references: [conversations.id]
	}),
}));

export const cvAnalysisRelations = relations(cvAnalysis, ({one}) => ({
	resume: one(resumes, {
		fields: [cvAnalysis.resumeId],
		references: [resumes.id]
	}),
	user: one(user, {
		fields: [cvAnalysis.userId],
		references: [user.id]
	}),
}));

export const resumesRelations = relations(resumes, ({one, many}) => ({
	cvAnalyses: many(cvAnalysis),
	user: one(user, {
		fields: [resumes.userId],
		references: [user.id]
	}),
}));

export const cvAnalysisResultsRelations = relations(cvAnalysisResults, ({one}) => ({
	hiringPosition: one(hiringPositions, {
		fields: [cvAnalysisResults.positionId],
		references: [hiringPositions.id]
	}),
	candidateCv: one(candidateCvs, {
		fields: [cvAnalysisResults.cvId],
		references: [candidateCvs.id]
	}),
}));

export const emailCampaignsRelations = relations(emailCampaigns, ({one}) => ({
	lead: one(leads, {
		fields: [emailCampaigns.leadId],
		references: [leads.id]
	}),
	user: one(user, {
		fields: [emailCampaigns.userId],
		references: [user.id]
	}),
}));

export const leadsRelations = relations(leads, ({one, many}) => ({
	emailCampaigns: many(emailCampaigns),
	user: one(user, {
		fields: [leads.userId],
		references: [user.id]
	}),
}));

export const examQuestionSessionsRelations = relations(examQuestionSessions, ({one}) => ({
	user: one(user, {
		fields: [examQuestionSessions.userId],
		references: [user.id]
	}),
}));

export const freelancerOffersRelations = relations(freelancerOffers, ({one}) => ({
	user: one(user, {
		fields: [freelancerOffers.userId],
		references: [user.id]
	}),
}));

export const freelancerPortfolioRelations = relations(freelancerPortfolio, ({one}) => ({
	user: one(user, {
		fields: [freelancerPortfolio.userId],
		references: [user.id]
	}),
}));

export const hiremindStateRelations = relations(hiremindState, ({one}) => ({
	user: one(user, {
		fields: [hiremindState.userId],
		references: [user.id]
	}),
}));

export const interviewQuestionSessionsRelations = relations(interviewQuestionSessions, ({one}) => ({
	user: one(user, {
		fields: [interviewQuestionSessions.userId],
		references: [user.id]
	}),
}));

export const invitationsRelations = relations(invitations, ({one}) => ({
	conversation: one(conversations, {
		fields: [invitations.conversationId],
		references: [conversations.id]
	}),
	user: one(user, {
		fields: [invitations.inviterId],
		references: [user.id]
	}),
}));

export const jobSearchesRelations = relations(jobSearches, ({one}) => ({
	user: one(user, {
		fields: [jobSearches.userId],
		references: [user.id]
	}),
}));

export const predictionsRelations = relations(predictions, ({one}) => ({
	user: one(user, {
		fields: [predictions.userId],
		references: [user.id]
	}),
}));

export const proposalsRelations = relations(proposals, ({one}) => ({
	user: one(user, {
		fields: [proposals.userId],
		references: [user.id]
	}),
	clientProject: one(clientProjects, {
		fields: [proposals.projectId],
		references: [clientProjects.id]
	}),
}));

export const researchSessionsRelations = relations(researchSessions, ({one}) => ({
	user: one(user, {
		fields: [researchSessions.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	user: one(user, {
		fields: [subscriptions.userId],
		references: [user.id]
	}),
}));

export const canvasProjectsRelations = relations(canvasProjects, ({one}) => ({
	user: one(user, {
		fields: [canvasProjects.userId],
		references: [user.id]
	}),
}));