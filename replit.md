# Overview

This project is a pnpm monorepo for "GymQuest," a Turkish MMORPG-style fitness mobile application. Users gain XP from workouts, develop their characters, compete in a league system, form groups, and battle bosses. The goal is to gamify fitness, providing an engaging experience with character progression, social interaction, and competitive elements.

# User Preferences

I prefer concise explanations and iterative development. Ask for my input before making significant architectural changes or adding new external dependencies. I also prefer detailed explanations for complex logic.

# System Architecture

The project is structured as a pnpm monorepo using TypeScript, Node.js 24, and pnpm.

**Core Components:**

*   **API Server (`artifacts/api-server/`):** Built with Express 5, using PostgreSQL and Drizzle ORM for data persistence. Zod is used for validation.
*   **Mobile App (`artifacts/gymquest/`):** Developed with Expo and React Native.
*   **Shared Libraries (`lib/`):**
    *   `api-client-react`: React Query hooks for API interaction.
    *   `api-zod`: Generated Zod schemas.
    *   `db`: Drizzle ORM schema and database connection.

**Key Features & Design Patterns:**

*   **Character System:** 12 D&D-inspired classes and 6 original races, each with unique stats, XP bonuses, abilities, and lore. Character progression includes visual evolution stages.
*   **Exercise Library:** A comprehensive library of 142+ exercises across 14 categories, each with detailed attributes (subMuscle, equipment, difficulty, unit, MET, xpPerUnit, movement, force, plane, tempoSec, classAffinity).
*   **XP and Leveling:** A progressive leveling formula (`150 * 1.1^(level-1)`) with centralized `processLevelUp()` in `routes/character.ts`. All XP-granting paths (workouts, quests, daily quests, battle pass, boss rewards, achievements, retention) use this shared function for multi-level-up support and consistent stat recalculation.
*   **League System:** Both individual and group-based leagues (Iron to Championship) driven by XP thresholds.
*   **Party System:** Users can form groups of up to 5, with roles and invite codes.
*   **Boss Events:** Six original bosses that parties can fight by logging workouts, earning rewards upon defeat.
*   **Achievement System:** 15 achievements with varying rarities, automatically tracked during workouts.
*   **Daily Quests:** Timezone-aware, randomized daily quests with varying difficulties and rewards (XP, coins, gems). Implements an atomic claim system to prevent double rewards.
*   **Economy Balancing System:** A central module (`artifacts/api-server/src/economy.ts`) manages daily income limits, level-based scaling, anti-hoarding measures, and minimum effort controls for rewards.
*   **Workout Security & Flexibility:**
    *   `WorkoutMode` (recommended, custom, free) with server-side validation.
    *   Atomic XP/level/streak updates using DB transactions (`FOR UPDATE` row lock) to prevent race conditions.
    *   Global workout cooldown (10 minutes) and API rate limiting.
    *   Anti-spam mechanisms for frequent workouts (hourly, daily, same exercise repetition).
    *   Combined XP system using `applyXPModifiers()` and `applyStreakBonus()`.
    *   Input sanitization and mode integrity checks.
    *   Health disclaimer acceptance stored in DB.
    *   Audit logs for workouts.
*   **Streak System:** Server-side, timezone-aware tracking of workout streaks based on local calendar days.
*   **Anti-Cheat & Fraud Protection Layer (`middlewares/anticheat.ts`):**
    *   `validateUserAction()` middleware: checks active XP-block penalties, counts recent violations, auto-applies penalties at threshold (6+ violations → 2hr XP block).
    *   `validateTimestamp()` middleware: rejects future timestamps (>5min) and backdated timestamps (>24hr).
    *   `validateWorkoutConsistency()` middleware: flags duration/sets mismatches, extreme volume, zero-effort submissions.
    *   `checkWorkoutHourlyCap()`: max 5 workouts per hour.
    *   `checkXpHourlyCap()`: max 2000 XP per hour.
    *   `createEndpointRateLimiter()`: per-endpoint rate limiting (10/min for workouts, 10/min for store, 5/min for payments).
    *   `logSuspiciousActivity()`: writes to `suspicious_activity` table with severity levels (info/warning/critical).
    *   Soft enforcement: 3+ violations → warning in response, 6+ → temporary XP block with `user_penalties` table.
    *   Applied to: `POST /workouts`, `POST /workout/complete`, `POST /store/purchase`, `POST /payment/create-session`.
    *   Replay attack protection: Stripe session ID uniqueness + `fulfillPurchase` atomic status check (pending→completed only).
*   **Soft Cap System:** Applies XP reductions for excessive daily workouts.
*   **Retention & Engagement System (`routes/retention.ts`):**
    *   Daily Login Rewards: 7-day cycle with scaling XP/coin/gem rewards (day 1: small → day 7: large). Streak resets if missed. `POST /retention/claim-daily`.
    *   Weekly Activity Chest: Tracks 7 days of workout activity per week, bonus chest on completion. `POST /retention/claim-weekly-chest`. `trackDailyActivity()` called from workout endpoints.
    *   Comeback Bonus: Detects 48h+ inactivity, grants one-time reward. `POST /retention/claim-comeback`.
    *   Notification Flags: `notifyMissedWorkout` (24-48h since last workout), `notifyStreakBreaking` (36-48h with active streak). Updated on `/retention/status` call.
    *   UX Hooks: `GET /retention/status` returns `canClaimDailyReward`, `hasActiveQuests`, `hasUnclaimedQuests`, `weeklyChestAvailable`, `comebackAvailable`, streak info, notification flags.
    *   Anti-abuse: All claims use `FOR UPDATE` row locks, unique constraints on (userId, claimDate), timestamp validation. Rewards processed through economy module.
    *   Daily quest "boost_used" type: tracks boost purchases toward quest completion via `updateBoostQuestProgress()`.
*   **Market Economy:** In-game store for cosmetic Auras (with passive bonuses) and Boosts (XP modifiers) with rarity, daily limits, cooldowns, and atomic purchase transactions.
*   **Battle Pass:** 30-day seasons with 50 levels, offering free and premium reward tracks. Automated season generation and management.
*   **Workout Generator:** A function (`generateWorkout`) that creates personalized workout plans based on user level, class, equipment, and movement balance.
*   **Authentication:** Token-based authentication using `authToken` generated upon character creation, stored client-side, and used for `Bearer` token authorization.
*   **API Error Handling:** `apiPost` returns `ApiResult<T>` — a discriminated union of `{ ok: true, data: T }` or `{ ok: false, error, code?, status, remainingSeconds?, xpEarned? }`. Only 500+ server errors throw `ApiError`. All callers check `res.ok` before using `res.data`. React Query mutations re-throw 400 errors from within `mutationFn` to trigger `onError`. `apiGet` and `apiDelete` still throw for all errors.
*   **UI/UX Feedback & Engagement Layer (`components/feedback/`):**
    *   XPGainOverlay: Animated floating XP gain popup after workout (shows breakdown, coins, gems). Replaces instant navigation on workout complete.
    *   RewardPopup: Modal reward claim feedback with animated item reveal and haptic.
    *   StreakBadge: Visual streak indicator with pulsing warning animation when streak is at risk.
    *   UrgencyBanner: Time-sensitive warnings ("Streak will break in X hours", "Daily reward expiring").
    *   MotivationalBanner: Context-aware motivational messages based on inactivity duration. Shows comeback bonus hint.
    *   DailyRewardCalendar: 7-day calendar UI with locked/claimed/available states. Integrates with `GET /retention/status` and `POST /retention/claim-daily`.
    *   QuestProgressBar: Animated progress bar with flash effects on progress, completion glow.
    *   Button micro-feedback: Spring scale animations on press for exercise cards and action buttons.
    *   Home screen integrates: DailyRewardCalendar, StreakBadge, UrgencyBanner, MotivationalBanner.
    *   Quest screen integrates: QuestProgressBar in quest cards, separated active/completed sections, auto-refresh every 15s.
    *   Workout log integrates: XPGainOverlay shown before navigating back after successful workout.
*   **Growth & Viral Loop System (`routes/referral.ts`, `routes/friends.ts`, `routes/notifications.ts`):**
    *   Referral System: Unique referral codes (R + 6 chars) generated on character creation. `POST /referral/apply` rewards referrer (10 gems) and referred (5 gems + 500 coins). Anti-abuse: max 10 referrals/day, max 50 total, self-referral blocked, IP logging.
    *   Friend System: Unique friend codes (F + 6 chars). `POST /friends/add` (by code), `GET /friends`, `DELETE /friends/:id`. Max 50 friends. Bidirectional friendship records.
    *   Challenge System: 7-day XP duels between friends. `POST /challenges/create`, `GET /challenges`, `POST /challenges/resolve`. Max 3 active. Winner: 15 gems + 1000 coins. Auto-score tracking from workouts.
    *   Enhanced Leaderboards: `GET /leaderboard/weekly` (weeklyXp, resets Monday), `GET /leaderboard/streak` (top streak days). Weekly XP tracked on character via workout flow.
    *   Share Card: `GET /share-card` returns character stats, global rank, top achievements, share text with referral code for social sharing.
    *   Notification System: `GET /notifications` (with unread count), `POST /notifications/read` (mark read). Auto-generated for: referral used, friend added, challenge received/won/lost/draw.
    *   Onboarding: Optional referral code input on character creation summary step.
    *   Mobile UI: Profile screen has social buttons (Friends, Notifications with badge, Share), referral code display with copy. Dedicated Friends screen with add/remove/challenge. Notifications screen with type icons, time-ago, mark-all-read.
*   **UI/UX:** Fully Turkish interface. Mobile screens include Onboarding, Home, Workout Logging, Level Up, Quests, Market, Party, Leaderboards, Friends, Notifications, and Profile. Uses `@expo/vector-icons` for icons.

**Database Schema Highlights:**

Key tables include `characters`, `workouts`, `workout_audit_logs`, `daily_quests`, `purchases`, `active_boosts`, `parties`, `party_members`, `boss_events`, `event_contributions`, `character_achievements`, `auth_tokens`, `daily_economy`, `iap_products`, `iap_purchases`, `suspicious_activity`, `user_penalties`, `daily_rewards`, `weekly_activity`, `comeback_rewards`, `referrals`, `friends`, `challenges`, `leaderboard_snapshots`, `notifications`, and `analytics_events`.

**Real-Money Purchase (IAP) System:** Stripe-backed purchase flow. `POST /payment/create-session` creates Stripe Checkout Session + pending IAP purchase. Stripe webhook (`POST /api/stripe/webhook`) fulfills purchase on `checkout.session.completed` — grants gems + battle pass atomically. Security: webhook verifies amount matches product, session ID matches purchase, `FOR UPDATE` row locks prevent double-fulfillment, failed fulfillment returns 500 so Stripe retries. Files: `stripeClient.ts`, `webhookHandlers.ts`, `routes/payment.ts`, `routes/shop.ts`.
*   **Monetization Optimization System:** Product Tiers (4 tiers: starter $0.99, mid $4.99 "EN_POPULER", high $9.99 "EN_IYI_DEGER", whale $24.99 "OZEL" with badge). First Purchase Bonus (2x gems via `hasPurchased` flag). Daily Offers (rotating 20-40% discount with countdown). Currency Sinks (reroll-quest 50 gems, skip-cooldown 30 gems, instant-boost 20 gems). Soft Paywall (`freeUserPenalty` flag). Whale Badge (`exclusive_badge`). Purchase Analytics (`purchase_analytics` table, admin-only `GET /analytics/monetization`). Premium UI tab in store with anchor pricing, tag badges, PurchaseSuccessOverlay. Mobile checkout via `Linking.openURL`.
*   **Analytics & Event Tracking System (`trackEvent.ts`, `routes/analytics.ts`, `schema/analytics.ts`):**
    *   `trackEvent(userId, eventName, payload)`: Fire-and-forget utility. Inserts into `analytics_events` table (serial id, userId, eventName, jsonb payload, createdAt). Sanitizes sensitive keys (password, token, secret, etc.) from payload.
    *   Tracked Events: `user_signup`, `workout_completed`, `xp_gained`, `level_up`, `streak_updated`, `reward_claimed`, `purchase_started`, `purchase_completed`, `referral_used`.
    *   Integrations: character.ts (signup), workouts.ts (workout+xp+level+streak), retention.ts (reward), payment.ts (purchase start/complete), referral.ts (referral).
    *   Admin Dashboard Endpoints (admin-only via `ADMIN_USER_IDS` env var): `GET /analytics/summary` (total users, active 24h, workouts, XP, purchases, revenue), `GET /analytics/funnel` (signup->first workout->second workout->purchase conversion), `GET /analytics/top-products` (most purchased, revenue per item), `GET /analytics/retention` (day 1/3/7 retention rates).
    *   DB Indexes: `event_name`, `user_id`, `created_at`, `(user_id, event_name)` for performance.

# External Dependencies

*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **API Framework:** Express 5
*   **Mobile Framework:** Expo + React Native
*   **Validation:** Zod (`zod/v4`), `drizzle-zod`
*   **Build Tool:** esbuild
*   **Icons:** `@expo/vector-icons` (MaterialCommunityIcons)
*   **State Management/Data Fetching:** React Query (for `api-client-react`)
*   **Clipboard:** `expo-clipboard` (~8.0.8)
*   **Payments:** Stripe SDK (`stripe`), `stripe-replit-sync` (webhook sync + managed webhooks)
*   **Network:** `@react-native-community/netinfo` (offline detection)

# Offline Handling

*   **NetworkContext (`context/NetworkContext.tsx`):** Provides `isOnline` and `isInternetReachable` via React context. Uses `@react-native-community/netinfo` on native, `navigator.onLine` on web. Exports `getIsOnline()` for non-component code. Strict connectivity: requires both `isConnected` AND `isInternetReachable !== false`.
*   **OfflineBanner (`components/OfflineBanner.tsx`):** Animated red banner slides down from top when offline, showing "Internet baglantisi yok" with wifi-off icon. Dynamic height based on safe-area insets.
*   **API Gating:** `fetchWithRetry()` in GameContext throws `OfflineError` before any network call when offline. React Query configured to not retry `OfflineError` and to pause queries when offline via `onlineManager`.
*   **Caching (`lib/offlineCache.ts`):** Character and workout data cached in AsyncStorage on successful fetch. On init failure, cached character is restored. Profile workouts fall back to cache when offline.
*   **Query Gating:** Profile queries (achievements, notifications, referral-stats) disabled when offline. Notification polling stops offline. `refetchOnReconnect: true` ensures data refreshes when connectivity returns.
*   **Workout Submission:** Log-workout submit button disabled when offline, shows "Cevrimdisi — Kayit Yapilamaz" with wifi-off icon.