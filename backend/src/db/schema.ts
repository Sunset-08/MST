import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================
// ENUMS
// ============================================================

export const userRoleEnum = pgEnum("user_role", [
  "participant",
  "platform_admin",
]);

export const organizationMemberRoleEnum = pgEnum(
  "organization_member_role",
  [
    "owner",
    "admin",
    "member",
  ],
);

export const sourceTypeEnum = pgEnum("source_type", [
  "github",
  "hackerone",
  "bugcrowd",
  "intigriti",
  "native",
]);

export const challengeDifficultyEnum = pgEnum("challenge_difficulty", [
  "easy",
  "medium",
  "hard",
  "expert",
]);

export const challengeTypeEnum = pgEnum("challenge_type", [
  "code",
  "investigation",
  "fix",
  "security_report",
]);

export const challengeStatusEnum = pgEnum("challenge_status", [
  "draft",
  "published",
  "archived",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "started",
  "submitted",
  "verified",
  "failed",
  "expired",
]);

export const submissionTypeEnum = pgEnum("submission_type", [
  "code",
  "patch",
  "report",
  "investigation",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "verified",
  "rejected",
]);

export const verificationTypeEnum = pgEnum("verification_type", [
  "automated_test",
  "rule_based",
  "admin_review",
  "peer_review",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "passed",
  "failed",
]);

export const rewardStatusEnum = pgEnum("reward_status", [
  "pending",
  "submitted",
  "confirmed",
  "failed",
]);

// ============================================================
// USERS / PARTICIPANTS
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Supabase Auth user ID
  authUserId: text("auth_user_id").unique(),

  // Public profile
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),

  email: text("email").notNull().unique(),

  avatarUrl: text("avatar_url"),
  bio: text("bio"),

  githubUsername: text("github_username").unique(),

  role: userRoleEnum("role")
    .notNull()
    .default("participant"),

  // ==========================================================
  // GAMIFICATION
  // ==========================================================

  points: integer("points")
    .notNull()
    .default(0),

  reputation: integer("reputation")
    .notNull()
    .default(0),

  level: integer("level")
    .notNull()
    .default(1),

  currentStreak: integer("current_streak")
    .notNull()
    .default(0),

  longestStreak: integer("longest_streak")
    .notNull()
    .default(0),

  lastActivityAt: timestamp("last_activity_at", {
    withTimezone: true,
  }),

  // ==========================================================
  // TIMESTAMPS
  // ==========================================================

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// PLAYER WALLETS
// ============================================================

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    address: text("address").notNull(),

    network: text("network")
      .notNull()
      .default("mst-testnet"),

    isPrimary: boolean("is_primary")
      .notNull()
      .default(false),

    // Wallet ownership verification
    isVerified: boolean("is_verified")
      .notNull()
      .default(false),

    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("wallet_user_address_unique").on(
      table.userId,
      table.address,
    ),
  ],
);

// ============================================================
// SECUREX ORGANIZATIONS / COMPANIES
// ============================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),

  slug: text("slug")
    .notNull()
    .unique(),

  description: text("description"),

  logoUrl: text("logo_url"),

  website: text("website"),

  status: text("status")
    .notNull()
    .default("active"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// ORGANIZATION MEMBERS
// ============================================================

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    role: organizationMemberRoleEnum("role")
      .notNull()
      .default("member"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("organization_member_unique").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

// ============================================================
// SECURITY SOURCES
// ============================================================
//
// A source represents where security issues/programs originate.
//
// Examples:
// - GitHub
// - HackerOne
// - Bugcrowd
// - Intigriti
// - SECUREX native
//
// This keeps SECUREX platform-neutral.
// ============================================================

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name")
    .notNull()
    .unique(),

  type: sourceTypeEnum("type")
    .notNull()
    .unique(),

  baseUrl: text("base_url"),

  isActive: boolean("is_active")
    .notNull()
    .default(true),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// ORGANIZATION SOURCE CONNECTIONS
// ============================================================
//
// Connects a SECUREX organization to an external source.
//
// Example:
//
// Bitster
//   ↓
// GitHub
//   ↓
// Bitster GitHub Organization
//
// Or eventually:
//
// Bitster
//   ↓
// HackerOne
//   ↓
// Bitster HackerOne Program
// ============================================================

export const organizationSources = pgTable(
  "organization_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, {
        onDelete: "cascade",
      }),

    // ID of the organization's entity on the external platform.
    externalId: text("external_id"),

    // Name used by the external platform.
    externalName: text("external_name"),

    externalUrl: text("external_url"),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("organization_source_unique").on(
      table.organizationId,
      table.sourceId,
    ),
  ],
);

// ============================================================
// GITHUB ORGANIZATIONS
// ============================================================
//
// GitHub-specific integration details.
//
// SECUREX Organization
//        ↓
// organization_sources
//        ↓
// GitHub
//        ↓
// github_organizations
// ============================================================

export const githubOrganizations = pgTable(
  "github_organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "cascade",
      }),

    githubOrgId: text("github_org_id")
      .notNull()
      .unique(),

    name: text("name")
      .notNull(),

    login: text("login")
      .notNull()
      .unique(),

    // GitHub App installation ID
    installationId: text("installation_id")
      .notNull()
      .unique(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
);

// ============================================================
// GITHUB REPOSITORIES
// ============================================================

export const repositories = pgTable("repositories", {
  id: uuid("id").defaultRandom().primaryKey(),

  githubOrganizationId: uuid("github_organization_id")
    .notNull()
    .references(() => githubOrganizations.id, {
      onDelete: "cascade",
    }),

  githubRepoId: text("github_repo_id")
    .notNull()
    .unique(),

  name: text("name")
    .notNull(),

  fullName: text("full_name")
    .notNull(),

  url: text("url")
    .notNull(),

  defaultBranch: text("default_branch")
    .notNull()
    .default("main"),

  isActive: boolean("is_active")
    .notNull()
    .default(true),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// GITHUB ISSUES
// ============================================================

export const githubIssues = pgTable(
  "github_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, {
        onDelete: "cascade",
      }),

    githubIssueId: text("github_issue_id")
      .notNull()
      .unique(),

    issueNumber: integer("issue_number")
      .notNull(),

    title: text("title")
      .notNull(),

    body: text("body"),

    author: text("author"),

    url: text("url")
      .notNull(),

    state: text("state")
      .notNull(),

    labels: jsonb("labels")
      .$type<string[]>()
      .default([]),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull(),

    syncedAt: timestamp("synced_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("repository_issue_number_unique").on(
      table.repositoryId,
      table.issueNumber,
    ),
  ],
);

// ============================================================
// CHALLENGES
// ============================================================
//
// A source issue is transformed into a SECUREX challenge.
//
// GitHub Issue / Future External Bounty
//              ↓
//       SECUREX Challenge
// ============================================================

export const challenges = pgTable("challenges", {
  id: uuid("id").defaultRandom().primaryKey(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, {
      onDelete: "cascade",
    }),

  githubIssueId: uuid("github_issue_id")
    .references(() => githubIssues.id, {
      onDelete: "set null",
    }),

  title: text("title")
    .notNull(),

  description: text("description")
    .notNull(),

  category: text("category")
    .notNull(),

  difficulty: challengeDifficultyEnum("difficulty")
    .notNull(),

  challengeType: challengeTypeEnum("challenge_type")
    .notNull(),

  verificationType: verificationTypeEnum("verification_type")
    .notNull(),

  // Gamification reward
  pointsReward: integer("points_reward")
    .notNull(),

  // Blockchain reward
  mstReward: integer("mst_reward")
    .notNull(),

  maxAttempts: integer("max_attempts"),

  challengeConfig: jsonb("challenge_config")
    .$type<Record<string, unknown>>()
    .default({}),

  status: challengeStatusEnum("status")
    .notNull()
    .default("draft"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// CHALLENGE ATTEMPTS
// ============================================================

export const challengeAttempts = pgTable("challenge_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),

  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id, {
      onDelete: "cascade",
    }),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  status: attemptStatusEnum("status")
    .notNull()
    .default("started"),

  attemptCount: integer("attempt_count")
    .notNull()
    .default(1),

  score: integer("score"),

  startedAt: timestamp("started_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  completedAt: timestamp("completed_at", {
    withTimezone: true,
  }),
});

// ============================================================
// SUBMISSIONS
// ============================================================

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),

  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => challengeAttempts.id, {
      onDelete: "cascade",
    }),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id, {
      onDelete: "cascade",
    }),

  submissionType: submissionTypeEnum("submission_type")
    .notNull(),

  submissionData: jsonb("submission_data")
    .$type<Record<string, unknown>>()
    .notNull(),

  solutionHash: text("solution_hash"),

  status: submissionStatusEnum("status")
    .notNull()
    .default("pending"),

  submittedAt: timestamp("submitted_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// VERIFICATIONS
// ============================================================

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),

  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, {
      onDelete: "cascade",
    }),

  verificationType: verificationTypeEnum("verification_type")
    .notNull(),

  status: verificationStatusEnum("status")
    .notNull()
    .default("pending"),

  score: integer("score"),

  reason: text("reason"),

  evidence: jsonb("evidence")
    .$type<Record<string, unknown>>()
    .default({}),

  verifiedBy: uuid("verified_by")
    .references(() => users.id, {
      onDelete: "set null",
    }),

  verifiedAt: timestamp("verified_at", {
    withTimezone: true,
  }),
});

// ============================================================
// GAMIFICATION / POINTS / REPUTATION EVENTS
// ============================================================
//
// Every important points/reputation change is recorded here.
//
// Example:
//
// challenge_completed
// points = +500
// reputation = +20
// ============================================================

export const reputationEvents = pgTable("reputation_events", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  challengeId: uuid("challenge_id")
    .references(() => challenges.id, {
      onDelete: "set null",
    }),

  submissionId: uuid("submission_id")
    .references(() => submissions.id, {
      onDelete: "set null",
    }),

  eventType: text("event_type")
    .notNull(),

  points: integer("points")
    .notNull()
    .default(0),

  reputation: integer("reputation")
    .notNull()
    .default(0),

  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .default({}),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// ACHIEVEMENTS
// ============================================================

export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name")
    .notNull()
    .unique(),

  description: text("description")
    .notNull(),

  icon: text("icon"),

  pointsReward: integer("points_reward")
    .notNull()
    .default(0),

  criteria: jsonb("criteria")
    .$type<Record<string, unknown>>()
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// ============================================================
// USER ACHIEVEMENTS
// ============================================================

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, {
        onDelete: "cascade",
      }),

    earnedAt: timestamp("earned_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("user_achievement_unique").on(
      table.userId,
      table.achievementId,
    ),
  ],
);

// ============================================================
// GITHUB WEBHOOK EVENTS
// ============================================================

export const githubEvents = pgTable("github_events", {
  id: uuid("id").defaultRandom().primaryKey(),

  // GitHub delivery ID
  eventId: text("event_id")
    .notNull()
    .unique(),

  eventType: text("event_type")
    .notNull(),

  organizationId: uuid("organization_id")
    .references(() => organizations.id, {
      onDelete: "set null",
    }),

  repositoryId: uuid("repository_id")
    .references(() => repositories.id, {
      onDelete: "set null",
    }),

  payload: jsonb("payload")
    .$type<Record<string, unknown>>()
    .notNull(),

  receivedAt: timestamp("received_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  processedAt: timestamp("processed_at", {
    withTimezone: true,
  }),
});

// ============================================================
// BLOCKCHAIN REWARDS
// ============================================================
//
// This table records blockchain payment state.
// It does not contain private keys or execute transactions.
// ============================================================

export const rewards = pgTable("rewards", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, {
      onDelete: "cascade",
    }),

  challengeId: uuid("challenge_id")
    .notNull()
    .references(() => challenges.id, {
      onDelete: "cascade",
    }),

  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, {
      onDelete: "cascade",
    }),

  verificationId: uuid("verification_id")
    .notNull()
    .references(() => verifications.id, {
      onDelete: "cascade",
    }),

  walletAddress: text("wallet_address")
    .notNull(),

  amount: integer("amount")
    .notNull(),

  token: text("token")
    .notNull()
    .default("MSTC"),

  network: text("network")
    .notNull()
    .default("mst-testnet"),

  status: rewardStatusEnum("status")
    .notNull()
    .default("pending"),

  transactionHash: text("transaction_hash"),

  contractAddress: text("contract_address"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  paidAt: timestamp("paid_at", {
    withTimezone: true,
  }),
});