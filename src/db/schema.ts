import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';



// Auth tables for better-auth
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
    image: text("image"),
    phone: text("phone"),
    createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  lastSeen: integer("last_seen"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
  marketingConsentAt: integer("marketing_consent_at", { mode: "timestamp" }),
  // Beta/founding member fields
  beta_status: text("beta_status"),
  signup_order: integer("signup_order"),
  referral_code: text("referral_code"),
  welcome_email_sent: integer("welcome_email_sent", { mode: "boolean" }).default(false),
  stripe_customer_id: text("stripe_customer_id"),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  scopes: text("scopes"),
  tokenType: text("token_type"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// Hiremind application tables
export const resumes = sqliteTable('resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedAt: text('uploaded_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  company: text('company').notNull(),
  description: text('description'),
  location: text('location'),
  salaryRange: text('salary_range'),
  jobUrl: text('job_url'),
  matchScore: integer('match_score'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  appliedAt: text('applied_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  notes: text('notes'),
});

export const jobSearches = sqliteTable('job_searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  searchQuery: text('search_query').notNull(),
  filters: text('filters'),
  createdAt: text('created_at').notNull(),
});

// Add new tables for Hiremind enhancements
export const cvAnalysis = sqliteTable('cv_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }),
  fullName: text('full_name'),
  email: text('email'),
  phone: text('phone'),
  skills: text('skills', { mode: 'json' }),
  expertise: text('expertise'),
  jobTitles: text('job_titles', { mode: 'json' }),
  experienceYears: integer('experience_years'),
  education: text('education', { mode: 'json' }),
  summary: text('summary'),
  rawText: text('raw_text'),
  analyzedAt: text('analyzed_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const leads = sqliteTable('leads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  companyWebsite: text('company_website'),
  industry: text('industry'),
  location: text('location'),
  companySize: text('company_size'),
  matchScore: integer('match_score'),
  matchReason: text('match_reason'),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const emailCampaigns = sqliteTable('email_campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  leadId: integer('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('draft'),
  sentAt: text('sent_at'),
  openedAt: text('opened_at'),
  repliedAt: text('replied_at'),
  replyContent: text('reply_content'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const chatSessions = sqliteTable('chat_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  chatType: text('chat_type').notNull(),
  title: text('title').notNull(),
  lastMessageAt: text('last_message_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

// Community Chat Tables
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // 'individual' or 'group'
    name: text('name'), // Only for groups
    image: text('image'), // Only for groups
    inviteToken: text('invite_token'),
    createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const conversationParticipants = sqliteTable('conversation_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  joinedAt: text('joined_at').notNull(),
  typingUntil: integer('typing_until'),
});

export const communityMessages = sqliteTable('community_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  attachmentUrl: text('attachment_url'),
  attachmentType: text('attachment_type'),
  status: text('status').notNull().default('sent'), // 'sent', 'delivered', 'read'
  createdAt: text('created_at').notNull(),
});

export const invitations = sqliteTable('invitations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  inviterId: text('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  inviteType: text('invite_type').notNull().default('individual'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

export const hiremindState = sqliteTable('hiremind_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  stateJson: text('state_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const communityProfiles = sqliteTable('community_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  userType: text('user_type').notNull(), // 'freelancer' or 'client'
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  headline: text('headline'),
  location: text('location'),
  website: text('website'),
  skills: text('skills', { mode: 'json' }),
  hourlyRate: integer('hourly_rate'),
    pricingText: text('pricing_text'), // Custom pricing display e.g. "$50/hr", "From $200/project"
    availability: text('availability'),
  workExperience: text('work_experience', { mode: 'json' }),
  cvUrl: text('cv_url'),
  portfolioUrls: text('portfolio_urls', { mode: 'json' }),
  companyName: text('company_name'),
  companyDescription: text('company_description'),
  companySize: text('company_size'),
  industry: text('industry'),
  paymentMethods: text('payment_methods', { mode: 'json' }),
  stripeAccountId: text('stripe_account_id'), // Stripe Connect account ID for freelancers
  profileComplete: integer('profile_complete', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Bulk CV Analysis Tables for University/Organization Hiring
export const hiringPositions = sqliteTable('hiring_positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), // e.g., "Computer Science Professor"
  department: text('department').notNull(), // e.g., "Computer Science Department"
  organization: text('organization').notNull(), // e.g., "Harvard University"
  description: text('description'), // Job description and responsibilities
  requirements: text('requirements'), // Required qualifications
  preferredSkills: text('preferred_skills', { mode: 'json' }), // List of preferred skills
  experienceRequired: text('experience_required'), // e.g., "5+ years"
  educationRequired: text('education_required'), // e.g., "PhD in Computer Science"
  status: text('status').notNull().default('open'), // 'open', 'closed', 'analyzing', 'completed'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const candidateCVs = sqliteTable('candidate_cvs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').notNull().references(() => hiringPositions.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size').notNull(),
  candidateName: text('candidate_name'), // Extracted from CV
  candidateEmail: text('candidate_email'), // Extracted from CV
  candidatePhone: text('candidate_phone'), // Extracted from CV
  rawText: text('raw_text'), // Extracted text from CV
  status: text('status').notNull().default('pending'), // 'pending', 'analyzing', 'analyzed', 'error'
  uploadedAt: text('uploaded_at').notNull(),
});

export const cvAnalysisResults = sqliteTable('cv_analysis_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cvId: integer('cv_id').notNull().references(() => candidateCVs.id, { onDelete: 'cascade' }),
  positionId: integer('position_id').notNull().references(() => hiringPositions.id, { onDelete: 'cascade' }),
  overallScore: integer('overall_score').notNull(), // 0-100 score
  skillsMatch: integer('skills_match'), // 0-100
  experienceMatch: integer('experience_match'), // 0-100
  educationMatch: integer('education_match'), // 0-100
  recommendation: text('recommendation').notNull(), // 'highly_recommended', 'recommended', 'consider', 'not_recommended'
  strengths: text('strengths', { mode: 'json' }), // List of strengths
  weaknesses: text('weaknesses', { mode: 'json' }), // List of weaknesses
  summary: text('summary').notNull(), // AI-generated summary
  detailedAnalysis: text('detailed_analysis'), // Full analysis text
  suggestedDepartments: text('suggested_departments', { mode: 'json' }), // Other departments candidate might fit
  analyzedAt: text('analyzed_at').notNull(),
});

// Exam Question Generation Sessions
export const examQuestionSessions = sqliteTable('exam_question_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  topic: text('topic').notNull(),
  questionTypes: text('question_types').notNull(), // 'mcq', 'cq', 'both'
  difficulty: text('difficulty').notNull(), // 'easy', 'medium', 'hard'
  questionCount: integer('question_count').notNull(),
  instructions: text('instructions'),
  bookName: text('book_name'),
  mcqQuestions: text('mcq_questions', { mode: 'json' }), // Array of MCQ question objects
  cqQuestions: text('cq_questions', { mode: 'json' }), // Array of CQ question objects
  createdAt: text('created_at').notNull(),
});

// Freelancer Portfolio Items
export const freelancerPortfolio = sqliteTable('freelancer_portfolio', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  imageUrl: text('image_url'), // Base64 data URL or external URL
  linkUrl: text('link_url'), // External link to the project
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Freelancer Offers (services listed in the community marketplace)
export const freelancerOffers = sqliteTable('freelancer_offers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  price: integer('price').notNull(), // Starting price in dollars
  deliveryDays: integer('delivery_days').notNull(),
  imageUrl: text('image_url'), // Cover image
  tags: text('tags', { mode: 'json' }), // Array of tag strings
  status: text('status').notNull().default('active'), // 'active', 'paused', 'deleted'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Client Projects (posted by clients in the community marketplace)
export const clientProjects = sqliteTable('client_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  budget: text('budget').notNull(), // e.g., "$500 - $1000"
  deadline: text('deadline'), // Optional deadline text
  skills: text('skills', { mode: 'json' }), // Array of required skill strings
  status: text('status').notNull().default('open'), // 'open', 'in_progress', 'closed'
  proposals: integer('proposals').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Freelancer Proposals on Client Projects
export const proposals = sqliteTable('proposals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => clientProjects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  coverLetter: text('cover_letter').notNull(),
  bidAmount: text('bid_amount').notNull(), // e.g., "$500"
  deliveryDays: integer('delivery_days').notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'accepted', 'rejected', 'withdrawn'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Community Direct Messages (freelancer ↔ client)
export const communityDMs = sqliteTable('community_dms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationKey: text('conversation_key').notNull(), // sorted "{userId1}_{userId2}" for dedup
  senderId: text('sender_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  receiverId: text('receiver_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  attachments: text('attachments', { mode: 'json' }), // Array of attachment objects { name, url, type }
  projectId: integer('project_id'), // optional link to a client project
  proposalId: integer('proposal_id'), // optional link to a proposal
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  hiddenForUsers: text('hidden_for_users', { mode: 'json' }).default(null), // Array of userIds who deleted this message
  visibleTo: text('visible_to', { mode: 'json' }).default(null), // null = both, ["userId"] = only visible to that user
  createdAt: text('created_at').notNull(),
});

// Deliverables — tracks freelancer submissions and client revision requests
export const deliverables = sqliteTable('deliverables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contractId: text('contract_id').notNull(),
  messageId: integer('message_id').notNull().references(() => communityDMs.id),
  submittedBy: text('submitted_by').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('deliverable'), // deliverable | revision
  status: text('status').notNull().default('pending_review'), // pending_review | approved | revision_requested | superseded
  submittedAt: text('submitted_at').notNull(),
  reviewDeadline: text('review_deadline').notNull(),
  parentDeliverableId: integer('parent_deliverable_id').references((): any => (deliverables as any).id),
  reminder24hSent: integer('reminder_24h_sent', { mode: 'boolean' }).notNull().default(false),
  version: integer('version').notNull().default(1),
  isLatest: integer('is_latest', { mode: 'boolean' }).notNull().default(true),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

// Interview Question Generation Sessions
export const interviewQuestionSessions = sqliteTable('interview_question_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  department: text('department').notNull(),
  position: text('position'), // Optional position/purpose
  difficulty: text('difficulty').notNull(), // 'easy', 'medium', 'hard'
  questionCount: integer('question_count').notNull(),
  candidateName: text('candidate_name'), // Extracted from CV or summary
  candidateSummary: text('candidate_summary').notNull(),
  keyAreasToProbe: text('key_areas_to_probe', { mode: 'json' }), // Array of strings
  questions: text('questions', { mode: 'json' }).notNull(), // Array of question objects
  createdAt: text('created_at').notNull(),
});

// Research Sessions — stores user research history for prediction engine
export const researchSessions = sqliteTable('research_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  query: text('query').notNull(), // Original user query
  topic: text('topic').notNull(), // Extracted primary topic
  keywords: text('keywords', { mode: 'json' }), // Array of extracted keywords
  entities: text('entities', { mode: 'json' }), // Array of extracted entities (companies, people, locations)
  category: text('category'), // e.g. 'hiring', 'technology', 'market', 'education'
  resultSummary: text('result_summary'), // Brief summary of what was found
  createdAt: text('created_at').notNull(),
});

// Predictions — AI-generated predictions from research memory
export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  query: text('query').notNull(), // The prediction request
  prediction: text('prediction').notNull(), // AI-generated prediction text
  confidence: integer('confidence').notNull(), // 0-100 confidence score
  reasoning: text('reasoning'), // Why this prediction was made
  timelineData: text('timeline_data', { mode: 'json' }), // Past→Current→Future timeline points
  trendData: text('trend_data', { mode: 'json' }), // Supporting global trend data
  relatedSessionIds: text('related_session_ids', { mode: 'json' }), // Array of researchSession IDs used
  relatedTopics: text('related_topics', { mode: 'json' }), // Array of topic strings from user history
  createdAt: text('created_at').notNull(),
});

// Notifications
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'contract_offer', 'message', 'alert'
  title: text('title').notNull(),
  message: text('message').notNull(),
  actionUrl: text('action_url'), // Link to act on this notification
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(),
  status: text('status').notNull().default('pending'),
  currency: text('currency').notNull().default('GBP'),
  amount: integer('amount').notNull(),
  interval: text('interval').notNull().default('month'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).notNull().default(false),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// Legacy usage tracking table (kept for DB compatibility)
export const usageTracking = sqliteTable('usage_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  feature: text('feature').notNull(),
  count: integer('count').notNull().default(0),
  lastUsedDate: text('last_used_date').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Usage limits for free users — each feature tracked independently
export const userUsageLimits = sqliteTable('user_usage_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),

  // ── Legacy grouped counters (kept for DB compatibility) ──
  deepFeaturesCount: integer('deep_features_count').notNull().default(0),
  deepFeaturesResetAt: text('deep_features_reset_at'),
  outreachFeaturesCount: integer('outreach_features_count').notNull().default(0),
  outreachFeaturesResetAt: text('outreach_features_reset_at'),
  communityCount: integer('community_count').notNull().default(0),

  // ── Lifetime limits (no reset) ──
  // Assist features — limit 2 each
  deepResearchCount: integer('deep_research_count').notNull().default(0),
  marketAnalysisCount: integer('market_analysis_count').notNull().default(0),
  aiPredictionCount: integer('ai_prediction_count').notNull().default(0),
  canvasCodingCount: integer('canvas_coding_count').notNull().default(0),
  // Outreach features — limit 2 each
  emailOutreachCount: integer('email_outreach_count').notNull().default(0),
  examQuestionsCount: integer('exam_questions_count').notNull().default(0),
  // HireMindX Match (Bulk CV + Interview Questions) — limit 1 total
  matchCount: integer('match_count').notNull().default(0),
  // Community AI Agent — limit 1
  communityAiCount: integer('community_ai_count').notNull().default(0),
  // Community Job Post — limit 1
  communityPostCount: integer('community_post_count').notNull().default(0),

  // ── 24h reset limits ──
  // Attachments in Assist — limit 3/day
  attachmentCount: integer('attachment_count').notNull().default(0),
  attachmentResetAt: text('attachment_reset_at'),
  // Chat messages in Assist — limit 30/day
  chatMessageCount: integer('chat_message_count').notNull().default(0),
  chatMessageResetAt: text('chat_message_reset_at'),

  updatedAt: text('updated_at').notNull(),
});

export const canvasProjects = sqliteTable('canvas_projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  htmlContent: text('html_content').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Escrow Transactions — tracks contract payment lifecycle
export const escrowTransactions = sqliteTable('escrow_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contractId: text('contract_id').notNull(), // matches the contract_xxx id from DMs
  clientId: text('client_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  freelancerId: text('freelancer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  contractAmount: integer('contract_amount').notNull(), // in pence/cents
  platformFee: integer('platform_fee').notNull().default(0), // 10% of contract amount, set dynamically by code
  totalCharged: integer('total_charged').notNull(), // contractAmount + platformFee
  currency: text('currency').notNull().default('GBP'),
  status: text('status').notNull().default('pending'), // pending, funded, released, completed, cancelled, refunded
  paymentMethodId: integer('payment_method_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'), // for settlement tracking
  stripeTransferId: text('stripe_transfer_id'),
  settlementStatus: text('settlement_status').default('pending'), // pending, available, failed
  settledAt: text('settled_at'),
  fundedAt: text('funded_at'),
  releasedAt: text('released_at'),
  completedAt: text('completed_at'),
  cancelledAt: text('cancelled_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Payment Methods — saved payment instruments per user
export const paymentMethods = sqliteTable('payment_methods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // debit_card, credit_card, paypal, wise, payoneer, bank_swift
  label: text('label').notNull(), // e.g. "Visa ending 4242", "PayPal - john@email.com"
  last4: text('last4'), // for cards
  cardBrand: text('card_brand'), // visa, mastercard, amex
  expiryMonth: integer('expiry_month'), // for cards
  expiryYear: integer('expiry_year'), // for cards
  email: text('email'), // for paypal, wise
  accountId: text('account_id'), // for payoneer, bank SWIFT
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Freelancer Wallets — available and pending balance
export const freelancerWallets = sqliteTable('freelancer_wallets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  availableBalance: integer('available_balance').notNull().default(0), // in pence
  pendingBalance: integer('pending_balance').notNull().default(0), // in pence (funds in escrow)
  totalEarned: integer('total_earned').notNull().default(0), // lifetime earnings
  totalWithdrawn: integer('total_withdrawn').notNull().default(0), // lifetime withdrawals
  updatedAt: text('updated_at').notNull(),
});

// Wallet Transactions — full transaction history for freelancers
export const walletTransactions = sqliteTable('wallet_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // credit, withdrawal, fee_deduction, penalty
  amount: integer('amount').notNull(), // in pence
  fee: integer('fee').notNull().default(0), // transaction fee in pence
  netAmount: integer('net_amount').notNull(), // amount after fee
  contractId: text('contract_id'), // related contract
  stripePayoutId: text('stripe_payout_id'),
  stripeTransferId: text('stripe_transfer_id'),
  description: text('description').notNull(),
  withdrawalMethod: text('withdrawal_method'), // debit_card, credit_card, paypal, wise, payoneer, bank_swift
  status: text('status').notNull().default('completed'), // completed, pending, failed
  createdAt: text('created_at').notNull(),
});

// Cancellation Records — tracks cancellations for penalty escalation
export const cancellationRecords = sqliteTable('cancellation_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  userType: text('user_type').notNull(), // client or freelancer
  contractId: text('contract_id').notNull(),
  cancelledAt: text('cancelled_at').notNull(),
  wasWithinGracePeriod: integer('was_within_grace_period', { mode: 'boolean' }).notNull().default(false),
  penaltyApplied: text('penalty_applied'), // none, platform_fee, double_fee, ban
  isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

// Beta Signups — founding 100 members
export const betaSignups = sqliteTable('beta_signups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  signupOrder: integer('signup_order').notNull(), // 1–100
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // linked when user creates account
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  status: text('status').notNull().default('pending'), // pending, trialing, active, canceled, expired
  referralCode: text('referral_code').unique(),
  welcomeEmailSent: integer('welcome_email_sent', { mode: 'boolean' }).notNull().default(false),
  marketingConsent: integer('marketing_consent', { mode: 'boolean' }).notNull().default(false),
  marketingConsentAt: text('marketing_consent_at'),
  createdAt: text('created_at').notNull(),
});

// Referrals — tracks who used a founder's referral link
export const referrals = sqliteTable('referrals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  referrerId: text('referrer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  referralCode: text('referral_code').notNull(),
  referredEmail: text('referred_email').notNull(),
  referredUserId: text('referred_user_id').references(() => user.id, { onDelete: 'set null' }),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull().default('pending'), // pending, trialing, paid, refunded, canceled
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Founder Rewards — tracks free months, badge, and private access
export const founderRewards = sqliteTable('founder_rewards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  freeMonthsGranted: integer('free_months_granted').notNull().default(0),
  freeMonthsUsed: integer('free_months_used').notNull().default(0),
  freeMonthsPending: integer('free_months_pending').notNull().default(0),
  badgeGranted: integer('badge_granted', { mode: 'boolean' }).notNull().default(false),
  privateAccessGranted: integer('private_access_granted', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
