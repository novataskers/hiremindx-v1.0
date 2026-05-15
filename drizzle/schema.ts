import { sqliteTable, AnySQLiteColumn, foreignKey, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const account = sqliteTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at"),
	refreshTokenExpiresAt: integer("refresh_token_expires_at"),
	scope: text(),
	password: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const applications = sqliteTable("applications", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" } ),
	status: text().default("pending").notNull(),
	appliedAt: text("applied_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	notes: text(),
});

export const candidateCvs = sqliteTable("candidate_cvs", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	positionId: integer("position_id").notNull().references(() => hiringPositions.id, { onDelete: "cascade" } ),
	fileName: text("file_name").notNull(),
	fileUrl: text("file_url").notNull(),
	fileSize: integer("file_size").notNull(),
	candidateName: text("candidate_name"),
	candidateEmail: text("candidate_email"),
	candidatePhone: text("candidate_phone"),
	rawText: text("raw_text"),
	status: text().default("pending").notNull(),
	uploadedAt: text("uploaded_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	sessionId: integer("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" } ),
	role: text().notNull(),
	content: text().notNull(),
	createdAt: text("created_at").notNull(),
});

export const chatSessions = sqliteTable("chat_sessions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	chatType: text("chat_type").notNull(),
	title: text().notNull(),
	lastMessageAt: text("last_message_at").notNull(),
	createdAt: text("created_at").notNull(),
});

export const clientProjects = sqliteTable("client_projects", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	description: text(),
	category: text().notNull(),
	budget: text().notNull(),
	deadline: text(),
	skills: text(),
	status: text().default("open").notNull(),
	proposals: integer().default(0).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const communityDms = sqliteTable("community_dms", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	conversationKey: text("conversation_key").notNull(),
	senderId: text("sender_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	receiverId: text("receiver_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	message: text().notNull(),
	projectId: integer("project_id"),
	proposalId: integer("proposal_id"),
	isRead: integer("is_read").default(false).notNull(),
	createdAt: text("created_at").notNull(),
	attachments: text(),
	hiddenForUsers: text("hidden_for_users"),
	visibleTo: text("visible_to"),
},
(table) => [
	index("idx_community_dms_convkey_created").on(table.conversationKey, table.createdAt),
	index("idx_community_dms_is_read").on(table.isRead),
	index("idx_community_dms_created_at").on(table.createdAt),
	index("idx_community_dms_receiver_id").on(table.receiverId),
	index("idx_community_dms_sender_id").on(table.senderId),
	index("idx_community_dms_conversation_key").on(table.conversationKey),
]);

export const communityMessages = sqliteTable("community_messages", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" } ),
	senderId: text("sender_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	text: text().notNull(),
	attachmentUrl: text("attachment_url"),
	attachmentType: text("attachment_type"),
	status: text().default("sent").notNull(),
	createdAt: text("created_at").notNull(),
});

export const communityProfiles = sqliteTable("community_profiles", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	userType: text("user_type").notNull(),
	displayName: text("display_name").notNull(),
	bio: text(),
	headline: text(),
	location: text(),
	website: text(),
	skills: text(),
	hourlyRate: integer("hourly_rate"),
	pricingText: text("pricing_text"),
	availability: text(),
	workExperience: text("work_experience"),
	cvUrl: text("cv_url"),
	portfolioUrls: text("portfolio_urls"),
	companyName: text("company_name"),
	companyDescription: text("company_description"),
	companySize: text("company_size"),
	industry: text(),
	paymentMethods: text("payment_methods"),
	profileComplete: integer("profile_complete").default(false),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	stripeAccountId: text("stripe_account_id"),
},
(table) => [
	uniqueIndex("community_profiles_user_id_unique").on(table.userId),
]);

export const conversationParticipants = sqliteTable("conversation_participants", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	joinedAt: text("joined_at").notNull(),
	typingUntil: integer("typing_until"),
});

export const conversations = sqliteTable("conversations", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	type: text().notNull(),
	name: text(),
	image: text(),
	inviteToken: text("invite_token"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const cvAnalysis = sqliteTable("cv_analysis", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	resumeId: integer("resume_id").references(() => resumes.id, { onDelete: "cascade" } ),
	fullName: text("full_name"),
	email: text(),
	phone: text(),
	skills: text(),
	expertise: text(),
	jobTitles: text("job_titles"),
	experienceYears: integer("experience_years"),
	education: text(),
	summary: text(),
	rawText: text("raw_text"),
	analyzedAt: text("analyzed_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const cvAnalysisResults = sqliteTable("cv_analysis_results", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	cvId: integer("cv_id").notNull().references(() => candidateCvs.id, { onDelete: "cascade" } ),
	positionId: integer("position_id").notNull().references(() => hiringPositions.id, { onDelete: "cascade" } ),
	overallScore: integer("overall_score").notNull(),
	skillsMatch: integer("skills_match"),
	experienceMatch: integer("experience_match"),
	educationMatch: integer("education_match"),
	recommendation: text().notNull(),
	strengths: text(),
	weaknesses: text(),
	summary: text().notNull(),
	detailedAnalysis: text("detailed_analysis"),
	suggestedDepartments: text("suggested_departments"),
	analyzedAt: text("analyzed_at").notNull(),
});

export const emailCampaigns = sqliteTable("email_campaigns", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" } ),
	subject: text().notNull(),
	body: text().notNull(),
	status: text().default("draft").notNull(),
	sentAt: text("sent_at"),
	openedAt: text("opened_at"),
	repliedAt: text("replied_at"),
	replyContent: text("reply_content"),
	errorMessage: text("error_message"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const examQuestionSessions = sqliteTable("exam_question_sessions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	subject: text().notNull(),
	topic: text().notNull(),
	questionTypes: text("question_types").notNull(),
	difficulty: text().notNull(),
	questionCount: integer("question_count").notNull(),
	instructions: text(),
	bookName: text("book_name"),
	mcqQuestions: text("mcq_questions"),
	cqQuestions: text("cq_questions"),
	createdAt: text("created_at").notNull(),
});

export const freelancerOffers = sqliteTable("freelancer_offers", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	description: text(),
	category: text().notNull(),
	price: integer().notNull(),
	deliveryDays: integer("delivery_days").notNull(),
	imageUrl: text("image_url"),
	tags: text(),
	status: text().default("active").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const freelancerPortfolio = sqliteTable("freelancer_portfolio", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	description: text(),
	category: text().notNull(),
	imageUrl: text("image_url"),
	linkUrl: text("link_url"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const hiremindState = sqliteTable("hiremind_state", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	stateJson: text("state_json").notNull(),
	updatedAt: text("updated_at").notNull(),
},
(table) => [
	uniqueIndex("hiremind_state_user_id_unique").on(table.userId),
]);

export const hiringPositions = sqliteTable("hiring_positions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	department: text().notNull(),
	organization: text().notNull(),
	description: text(),
	requirements: text(),
	preferredSkills: text("preferred_skills"),
	experienceRequired: text("experience_required"),
	educationRequired: text("education_required"),
	status: text().default("open").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const interviewQuestionSessions = sqliteTable("interview_question_sessions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	department: text().notNull(),
	position: text(),
	difficulty: text().notNull(),
	questionCount: integer("question_count").notNull(),
	candidateName: text("candidate_name"),
	candidateSummary: text("candidate_summary").notNull(),
	keyAreasToProbe: text("key_areas_to_probe"),
	questions: text().notNull(),
	createdAt: text("created_at").notNull(),
});

export const invitations = sqliteTable("invitations", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	token: text().notNull(),
	conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" } ),
	inviteType: text("invite_type").default("individual").notNull(),
	status: text().default("pending").notNull(),
	createdAt: text("created_at").notNull(),
},
(table) => [
	uniqueIndex("invitations_token_unique").on(table.token),
]);

export const jobSearches = sqliteTable("job_searches", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	searchQuery: text("search_query").notNull(),
	filters: text(),
	createdAt: text("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	title: text().notNull(),
	company: text().notNull(),
	description: text(),
	location: text(),
	salaryRange: text("salary_range"),
	jobUrl: text("job_url"),
	matchScore: integer("match_score"),
	status: text().default("active").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const leads = sqliteTable("leads", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	companyName: text("company_name").notNull(),
	contactName: text("contact_name"),
	contactEmail: text("contact_email"),
	contactPhone: text("contact_phone"),
	companyWebsite: text("company_website"),
	industry: text(),
	location: text(),
	companySize: text("company_size"),
	matchScore: integer("match_score"),
	matchReason: text("match_reason"),
	status: text().default("new").notNull(),
	notes: text(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const predictions = sqliteTable("predictions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	query: text().notNull(),
	prediction: text().notNull(),
	confidence: integer().notNull(),
	reasoning: text(),
	timelineData: text("timeline_data"),
	trendData: text("trend_data"),
	relatedSessionIds: text("related_session_ids"),
	relatedTopics: text("related_topics"),
	createdAt: text("created_at").notNull(),
});

export const proposals = sqliteTable("proposals", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	projectId: integer("project_id").notNull().references(() => clientProjects.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	coverLetter: text("cover_letter").notNull(),
	bidAmount: text("bid_amount").notNull(),
	deliveryDays: integer("delivery_days").notNull(),
	status: text().default("pending").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const researchSessions = sqliteTable("research_sessions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	query: text().notNull(),
	topic: text().notNull(),
	keywords: text(),
	entities: text(),
	category: text(),
	resultSummary: text("result_summary"),
	createdAt: text("created_at").notNull(),
});

export const resumes = sqliteTable("resumes", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	fileName: text("file_name").notNull(),
	fileUrl: text("file_url").notNull(),
	fileSize: integer("file_size").notNull(),
	uploadedAt: text("uploaded_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const session = sqliteTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: integer("expires_at").notNull(),
	token: text().notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
},
(table) => [
	uniqueIndex("session_token_unique").on(table.token),
]);

export const user = sqliteTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: integer("email_verified").notNull(),
	image: text(),
	phone: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	lastSeen: integer("last_seen"),
},
(table) => [
	uniqueIndex("user_email_unique").on(table.email),
]);

export const verification = sqliteTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: integer("expires_at").notNull(),
	createdAt: integer("created_at"),
	updatedAt: integer("updated_at"),
});

export const notifications = sqliteTable("notifications", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	type: text().notNull(),
	title: text().notNull(),
	message: text().notNull(),
	actionUrl: text("action_url"),
	isRead: integer("is_read").default(false).notNull(),
	createdAt: text("created_at").notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" } ),
	planId: text("plan_id").notNull(),
	status: text().default("pending").notNull(),
	currency: text().default("GBP").notNull(),
	amount: integer().notNull(),
	interval: text().default("month").notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	stripeCheckoutSessionId: text("stripe_checkout_session_id"),
	currentPeriodStart: integer("current_period_start"),
	currentPeriodEnd: integer("current_period_end"),
	cancelAtPeriodEnd: integer("cancel_at_period_end").default(0).notNull(),
	metadata: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const usageTracking = sqliteTable("usage_tracking", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull(),
	feature: text().notNull(),
	count: integer().default(0).notNull(),
	lastUsedDate: text("last_used_date").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const canvasProjects = sqliteTable("canvas_projects", {
	id: text().primaryKey(),
	userId: text("user_id").references(() => user.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	htmlContent: text("html_content").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const userUsageLimits = sqliteTable("user_usage_limits", {
	id: integer().primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	deepFeaturesCount: integer("deep_features_count").default(0).notNull(),
	deepFeaturesResetAt: text("deep_features_reset_at"),
	outreachFeaturesCount: integer("outreach_features_count").default(0).notNull(),
	outreachFeaturesResetAt: text("outreach_features_reset_at"),
	attachmentCount: integer("attachment_count").default(0).notNull(),
	attachmentResetAt: text("attachment_reset_at"),
	chatMessageCount: integer("chat_message_count").default(0).notNull(),
	chatMessageResetAt: text("chat_message_reset_at"),
	communityCount: integer("community_count").default(0).notNull(),
	matchCount: integer("match_count").default(0).notNull(),
	updatedAt: text("updated_at").notNull(),
	deepResearchCount: integer("deep_research_count").default(0).notNull(),
	marketAnalysisCount: integer("market_analysis_count").default(0).notNull(),
	aiPredictionCount: integer("ai_prediction_count").default(0).notNull(),
	canvasCodingCount: integer("canvas_coding_count").default(0).notNull(),
	emailOutreachCount: integer("email_outreach_count").default(0).notNull(),
	examQuestionsCount: integer("exam_questions_count").default(0).notNull(),
	communityAiCount: integer("community_ai_count").default(0).notNull(),
	communityPostCount: integer("community_post_count").default(0).notNull(),
});

export const freelancerWallets = sqliteTable("freelancer_wallets", {
	id: integer().primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	availableBalance: integer("available_balance").default(0).notNull(),
	pendingBalance: integer("pending_balance").default(0).notNull(),
	totalEarned: integer("total_earned").default(0).notNull(),
	totalWithdrawn: integer("total_withdrawn").default(0).notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const walletTransactions = sqliteTable("wallet_transactions", {
	id: integer().primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	type: text().notNull(),
	amount: integer().notNull(),
	fee: integer().default(0).notNull(),
	netAmount: integer("net_amount").notNull(),
	contractId: text("contract_id"),
	stripePayoutId: text("stripe_payout_id"),
	stripeTransferId: text("stripe_transfer_id"),
	description: text().notNull(),
	withdrawalMethod: text("withdrawal_method"),
	status: text().default("completed").notNull(),
	createdAt: text("created_at").notNull(),
});

export const escrowTransactions = sqliteTable("escrow_transactions", {
	id: integer().primaryKey({ autoIncrement: true }),
	contractId: text("contract_id").notNull(),
	clientId: text("client_id").notNull(),
	freelancerId: text("freelancer_id").notNull(),
	contractAmount: integer("contract_amount").notNull(),
	platformFee: integer("platform_fee").default(1000).notNull(),
	totalCharged: integer("total_charged").notNull(),
	currency: text().default("GBP").notNull(),
	status: text().default("pending").notNull(),
	paymentMethodId: integer("payment_method_id"),
	stripePaymentIntentId: text("stripe_payment_intent_id"),
	stripeTransferId: text("stripe_transfer_id"),
	fundedAt: text("funded_at"),
	releasedAt: text("released_at"),
	completedAt: text("completed_at"),
	cancelledAt: text("cancelled_at"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	stripeChargeId: text("stripe_charge_id"),
	settlementStatus: text("settlement_status").default("pending"),
	settledAt: text("settled_at"),
});

export const cancellationRecords = sqliteTable("cancellation_records", {
	id: integer().primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	userType: text("user_type").notNull(),
	contractId: text("contract_id").notNull(),
	cancelledAt: text("cancelled_at").notNull(),
	wasWithinGracePeriod: integer("was_within_grace_period").default(0).notNull(),
	penaltyApplied: text("penalty_applied"),
	isBanned: integer("is_banned").default(0).notNull(),
	createdAt: text("created_at").notNull(),
});

export const paymentMethods = sqliteTable("payment_methods", {
	id: integer().primaryKey({ autoIncrement: true }),
	userId: text("user_id").notNull(),
	type: text().notNull(),
	label: text().notNull(),
	last4: text(),
	cardBrand: text("card_brand"),
	expiryMonth: integer("expiry_month"),
	expiryYear: integer("expiry_year"),
	email: text(),
	accountId: text("account_id"),
	isDefault: integer("is_default").default(0).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

