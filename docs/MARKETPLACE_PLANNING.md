# Agent Marketplace — Complete Planning Document

**Version:** 1.0  
**Status:** Planning  
**Last updated:** 2025-02-21

This document is the single source of truth for the Agent Marketplace feature: constraints, features, data model, migrations, API, client flows, and implementation checklist from zero to full-fledged.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Constraints](#2-constraints)
3. [User Stories & Features](#3-user-stories--features)
4. [Data Model & Migrations](#4-data-model--migrations)
5. [API Specification](#5-api-specification)
6. [Client Flows & Screens](#6-client-flows--screens)
7. [Security & RLS](#7-security--rls)
8. [Monetization (Payments)](#8-monetization-payments)
9. [Implementation Checklist](#9-implementation-checklist)
10. [Testing & Rollout](#10-testing--rollout)

---

## 1. Overview & Goals

### 1.1 What Is the Marketplace?

- A **public discovery layer** where users can **publish** their custom agents and other users can **browse**, **download** (copy into their account), and optionally **purchase** paid agents.
- **Download** = create a new agent in the downloader’s account with the same config (name, description, instruction, icon, skills). Knowledge Base is **not** copied in v1.
- Similar in spirit to: TikTok/Instagram (discovery + creator content) and AI agent marketplaces (Replicate, Hugging Face Spaces, etc.).

### 1.2 Goals

- **Discovery:** Anyone (or any logged-in user) can browse and search published agents.
- **Distribution:** Creators can publish agents once; many users can add them to their account.
- **Monetization (optional):** Support free and paid listings; paid flow via Stripe (or similar).
- **Trust:** Clear attribution (publisher name/avatar), optional ratings/reviews in a later phase.
- **Extensibility:** Design allows future additions: social features (likes, follows, comments), trending feeds, categories, and analytics.

### 1.3 Out of Scope (Explicitly)

- **v1:** No copying of Knowledge Base documents; only agent config + skills are copied.
- **v1:** No in-app ratings/reviews (can be added later with a `marketplace_reviews` table).
- **v1:** No “follow creator” or feed algorithm; listing is the unit of discovery.

---

## 2. Constraints

### 2.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| **Backend** | Go (Gin), Supabase (PostgreSQL). All new code must follow existing patterns: `handlers/`, `models/`, `database.GetAdminClient().DB`, JWT via `middleware.AuthMiddleware`. |
| **Client** | React Native (Expo). New screens must use existing navigation (React Navigation), theme (`useTheme`), and API client (`api` from `@/services/api`). |
| **Auth** | JWT in `Authorization: Bearer <token>`. User ID comes from token; no separate “marketplace user” model. |
| **DB** | Migrations must be idempotent (e.g. `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`). Run in order: 001…007 already exist; marketplace = 008+. |
| **API prefix** | All HTTP API under `/api/v1`. Marketplace routes under `/api/v1/marketplace/*`. |

### 2.2 Product Constraints

| Constraint | Description |
|------------|-------------|
| **Publish = opt-in** | Only the owner can publish an agent; publishing creates a **listing**, not “make agent public”. |
| **One listing per agent (v1)** | One agent can have at most one active listing. (Relax later if needed with a “version” or “listing_id” per agent.) |
| **Download = copy** | Download always creates a **new** agent for the downloader; no shared/linked agent. |
| **Instruction privacy** | Full system instruction is **not** exposed in public listing detail; only name, description, summary, skills. Instruction is used only server-side when copying on download. |

### 2.3 Security Constraints

| Constraint | Description |
|------------|-------------|
| **RLS** | Supabase RLS must enforce: public read for active listings only; write (insert/update/delete) only for listing owner. Backend uses service role where needed. |
| **Ownership** | Create listing: `agent_id` must belong to `user_id` (current user). Download: only creates agent for current user. |
| **No PII in public responses** | Listing responses may include publisher display name and avatar URL only; no email or internal IDs for other users. |

### 2.4 Business / Legal Constraints (To Define with Product)

- **Paid listings:** Who can sell? (e.g. any user vs. verified creators.)
- **Refunds:** Handled via Stripe/policy; document in Terms.
- **Content policy:** Prohibited content (harassment, illegal use, etc.); take-down process.
- **Revenue share:** If platform takes a cut, define % and payout schedule.

---

## 3. User Stories & Features

### 3.1 MVP (Phase 1)

| ID | Role | Story | Acceptance |
|----|------|-------|------------|
| M1 | Creator | As a user I can **publish** one of my agents to the marketplace (title, summary, category, free only in MVP). | Listing is created and appears in public list; status = active. |
| M2 | Creator | As a user I can **unpublish** (archive) my listing so it no longer appears. | Status set to archived; listing not returned in public list. |
| M3 | Browser | As a user I can **browse** marketplace listings (list + detail) with basic filters (category, sort by recent/popular). | Public GET list and GET by id work; response includes safe metadata only. |
| M4 | Browser | As a user I can **download** a free listing so the agent is **copied** into my account. | New agent created for me with same name, description, instruction, icon, skills; I see it under “Custom agents”. |
| M5 | Browser | As a user I see an **“Already downloaded”** state for listings I have already added. | Download endpoint or a separate “check” returns this; UI shows “In your agents” / disabled download. |
| M6 | Creator | As a creator I can **edit** my listing (title, summary, category) without changing the underlying agent. | PUT listing updates only listing fields; agent unchanged. |

### 3.2 Phase 2 — Paid Listings

| ID | Role | Story | Acceptance |
|----|------|-------|------------|
| P1 | Creator | As a creator I can set a **price** for my listing (e.g. one-time payment). | Listing has `price_cents`; only paid flow allows download after payment. |
| P2 | Buyer | As a user I can **pay** for a paid listing (Stripe Checkout or Payment Element) and then **download** the agent. | Payment success → download allowed; purchase recorded. |
| P3 | Buyer | As a buyer I do not see “Buy” again if I have already purchased. | Same as “Already downloaded” but for paid; one purchase per user per listing. |

### 3.3 Phase 3 — Discovery & Social (Later)

| ID | Feature | Description |
|----|---------|-------------|
| S1 | Categories / tags | Multiple categories or tags per listing; filter and search by tag. |
| S2 | Search | Full-text search on title, summary, creator name. |
| S3 | Trending / featured | “Featured” flag; sort by download_count (trending). |
| S4 | Cover image | Optional `cover_image_url` per listing for card UI. |
| S5 | Ratings & reviews | `marketplace_reviews` table; average rating on listing; optional comments. |
| S6 | Creator profile | Public profile page: list of user’s published agents (marketplace only). |
| S7 | Follow / feed | Follow creators; “From people you follow” feed (requires follow graph). |

---

## 4. Data Model & Migrations

### 4.1 Entity Relationship (Summary)

- **profiles** (existing): `id`, email, username, name, bio, avatar_url.
- **agents** (existing): `id`, user_id, name, description, instruction, icon_name, created_at, updated_at.
- **agent_skills** (existing): agent_id, skill_id.
- **marketplace_listings** (new): One row per “published” agent; references `agents.id` and `profiles.id` (publisher).
- **marketplace_downloads** (new): One row per user per listing when they download (or purchase); used for “already have it” and analytics.

### 4.2 Table: `marketplace_listings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | Listing ID. |
| agent_id | UUID | NOT NULL, FK → agents(id) ON DELETE CASCADE | Agent being published. |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Publisher (listing owner). |
| title | TEXT | NOT NULL | Display title (can differ from agent name). |
| summary | TEXT | DEFAULT '' | Short blurb for cards and meta. |
| category | TEXT | DEFAULT '' | Single category for MVP (e.g. productivity, coding, creative). |
| price_cents | INTEGER | DEFAULT 0 | 0 = free; >0 = paid (Phase 2). |
| status | TEXT | NOT NULL, DEFAULT 'draft' | draft \| active \| archived. |
| featured | BOOLEAN | DEFAULT false | Curated featured flag (Phase 3). |
| cover_image_url | TEXT | | Optional card image URL (Phase 3). |
| download_count | INTEGER | DEFAULT 0, NOT NULL | Incremented on each download. |
| created_at | TIMESTAMPTZ | DEFAULT now(), NOT NULL | |
| updated_at | TIMESTAMPTZ | DEFAULT now(), NOT NULL | |

**Indexes:**

- `idx_marketplace_listings_user_id` (user_id)
- `idx_marketplace_listings_agent_id` (agent_id)
- `idx_marketplace_listings_status` (status)
- `idx_marketplace_listings_category` (category)
- `idx_marketplace_listings_created_at` (created_at DESC)
- `idx_marketplace_listings_download_count` (download_count DESC) — for “popular”
- Unique: one active listing per agent (optional): partial unique index `(agent_id) WHERE status = 'active'`

**Allowed `status` values:** `draft`, `active`, `archived`.

### 4.3 Table: `marketplace_downloads`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| listing_id | UUID | NOT NULL, FK → marketplace_listings(id) ON DELETE CASCADE | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Downloader. |
| created_at | TIMESTAMPTZ | DEFAULT now(), NOT NULL | |

**Unique constraint:** `(listing_id, user_id)` — one download per user per listing.

**Indexes:**

- `idx_marketplace_downloads_listing_id` (listing_id)
- `idx_marketplace_downloads_user_id` (user_id)
- Unique index on `(listing_id, user_id)`

**Phase 2 (paid):** Optional columns: `payment_id` (Stripe PaymentIntent id), `amount_cents` (for records).

### 4.4 Migration File: `008_marketplace_listings.sql`

```sql
-- ============================================================
-- GenZ: Marketplace — listings and downloads
-- Run after 007_knowledge_base.sql. Safe to re-run (idempotent).
-- ============================================================

-- 1. Listings
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    summary         TEXT DEFAULT '',
    category        TEXT DEFAULT '',
    price_cents     INTEGER DEFAULT 0 NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    featured        BOOLEAN DEFAULT false NOT NULL,
    cover_image_url TEXT,
    download_count  INTEGER DEFAULT 0 NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_user_id    ON public.marketplace_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_agent_id   ON public.marketplace_listings(agent_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status     ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category   ON public.marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_created_at ON public.marketplace_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_download_count ON public.marketplace_listings(download_count DESC);

-- One active listing per agent (optional; uncomment if desired)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_listings_one_active_per_agent
--     ON public.marketplace_listings(agent_id) WHERE (status = 'active');

-- 2. Downloads (who downloaded which listing)
CREATE TABLE IF NOT EXISTS public.marketplace_downloads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id  UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_listing_id ON public.marketplace_downloads(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_user_id    ON public.marketplace_downloads(user_id);

-- 3. updated_at trigger for marketplace_listings
DROP TRIGGER IF EXISTS on_marketplace_listing_updated ON public.marketplace_listings;
CREATE TRIGGER on_marketplace_listing_updated
    BEFORE UPDATE ON public.marketplace_listings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
```

### 4.5 Migration File: `009_marketplace_rls.sql`

```sql
-- ============================================================
-- GenZ: Marketplace RLS policies
-- Run after 008_marketplace_listings.sql. Safe to re-run.
-- ============================================================

-- Listings: anyone can read active; only owner can insert/update/delete
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active listings" ON public.marketplace_listings;
CREATE POLICY "Anyone can view active listings"
    ON public.marketplace_listings FOR SELECT
    USING (status = 'active' OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own listings" ON public.marketplace_listings;
CREATE POLICY "Users can insert own listings"
    ON public.marketplace_listings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own listings" ON public.marketplace_listings;
CREATE POLICY "Users can update own listings"
    ON public.marketplace_listings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own listings" ON public.marketplace_listings;
CREATE POLICY "Users can delete own listings"
    ON public.marketplace_listings FOR DELETE
    USING (auth.uid() = user_id);

-- Downloads: users see only their own rows; insert via backend (service role)
ALTER TABLE public.marketplace_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own downloads" ON public.marketplace_downloads;
CREATE POLICY "Users can view own downloads"
    ON public.marketplace_downloads FOR SELECT
    USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for marketplace_downloads: only backend (service role) can write.
-- Clients only read their own rows via SELECT policy above.
```

### 4.6 Allowed Categories (MVP)

Use a fixed set for filters and validation. Example:

| Value | Label |
|-------|--------|
| productivity | Productivity |
| coding | Coding |
| creative | Creative |
| research | Research |
| general | General |

**Server:** Validate `category` in create/update against this set (or allow any string and filter in list).  
**Client:** Use same list for dropdown/filter chips.

### 4.7 Go Models (Server)

**File:** `server/models/marketplace.go`

```go
package models

import "time"

type MarketplaceListing struct {
	ID             string    `json:"id"`
	AgentID        string    `json:"agent_id"`
	UserID         string    `json:"user_id"`
	Title          string    `json:"title"`
	Summary        string    `json:"summary"`
	Category       string    `json:"category"`
	PriceCents     int       `json:"price_cents"`
	Status         string    `json:"status"`
	Featured       bool      `json:"featured"`
	CoverImageURL  string    `json:"cover_image_url,omitempty"`
	DownloadCount  int       `json:"download_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	// Joined for API response (optional)
	AgentName      string   `json:"agent_name,omitempty"`
	AgentDesc      string   `json:"agent_description,omitempty"`
	AgentIconName  string   `json:"agent_icon_name,omitempty"`
	AgentSkillIDs  []string `json:"agent_skill_ids,omitempty"`
	PublisherName  string   `json:"publisher_name,omitempty"`
	PublisherAvatar string  `json:"publisher_avatar_url,omitempty"`
}

type MarketplaceDownload struct {
	ID         string    `json:"id"`
	ListingID  string    `json:"listing_id"`
	UserID     string    `json:"user_id"`
	CreatedAt  time.Time `json:"created_at"`
}
```

---

## 5. API Specification

**Base path:** `/api/v1/marketplace`  
**Auth:** JWT in `Authorization: Bearer <token>` for protected routes.  
**Content-Type:** `application/json` for request/response unless noted.

### 5.1 List Listings (Public)

**GET** `/api/v1/marketplace/listings`

**Auth:** Optional. If provided, response can include `downloaded: true` for listings the user has already downloaded.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| status | string | active | Filter by status (e.g. `active` for public). |
| category | string | | Filter by category. |
| sort | string | recent | `recent` (created_at DESC) or `popular` (download_count DESC). |
| limit | int | 20 | Max 50. |
| offset | int | 0 | Pagination offset. |

**Response 200:**

```json
{
  "listings": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "user_id": "uuid",
      "title": "string",
      "summary": "string",
      "category": "string",
      "price_cents": 0,
      "status": "active",
      "featured": false,
      "cover_image_url": null,
      "download_count": 42,
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "agent_name": "string",
      "agent_description": "string",
      "agent_icon_name": "string",
      "publisher_name": "string",
      "publisher_avatar_url": null,
      "downloaded": false
    }
  ],
  "total": 100
}
```

**Notes:** Do **not** include `instruction` in list. `downloaded` is present and true only when the request is authenticated and the user has a row in `marketplace_downloads` for this listing.

---

### 5.2 Get Listing by ID (Public)

**GET** `/api/v1/marketplace/listings/:id`

**Auth:** Optional. If authenticated, include `downloaded: true` when the user has already downloaded.

**Response 200:**

```json
{
  "listing": {
    "id": "uuid",
    "agent_id": "uuid",
    "user_id": "uuid",
    "title": "string",
    "summary": "string",
    "category": "string",
    "price_cents": 0,
    "status": "active",
    "featured": false,
    "cover_image_url": null,
    "download_count": 42,
    "created_at": "ISO8601",
    "updated_at": "ISO8601",
    "agent_name": "string",
    "agent_description": "string",
    "agent_icon_name": "string",
    "agent_skill_ids": ["web_search", "memory"],
    "publisher_name": "string",
    "publisher_avatar_url": null,
    "downloaded": false
  }
}
```

**Response 404:** Listing not found or not active (if public view).  
**Note:** Do **not** return `instruction` in public detail; it is only used server-side on download.

---

### 5.3 Create Listing (Protected)

**POST** `/api/v1/marketplace/listings`

**Auth:** Required.

**Body:**

```json
{
  "agent_id": "uuid",
  "title": "string",
  "summary": "string",
  "category": "string",
  "price_cents": 0,
  "status": "draft"
}
```

- `agent_id`: Required; must be an agent owned by the current user.
- `title`: Required.
- `summary`, `category`: Optional.
- `price_cents`: Optional; default 0 (MVP: enforce 0 if paid not implemented).
- `status`: Optional; default `draft`. Allowed: `draft`, `active`.

**Response 201:**

```json
{
  "listing": { /* full MarketplaceListing with joined agent/publisher fields */ }
}
```

**Errors:**

- 400: Invalid body or agent_id not owned by user.
- 409: Agent already has an active listing (if one-active-per-agent rule is enforced).

---

### 5.4 Update Listing (Protected)

**PUT** `/api/v1/marketplace/listings/:id`

**Auth:** Required. Caller must be the listing owner.

**Body:** Same as create; all fields optional. Do not allow changing `agent_id` (or document that changing agent_id is not supported in v1).

**Response 200:**

```json
{
  "listing": { /* full listing */ }
}
```

**Errors:** 403 if not owner; 404 if listing not found.

---

### 5.5 Delete / Archive Listing (Protected)

**DELETE** `/api/v1/marketplace/listings/:id`

**Auth:** Required. Caller must be the listing owner.

**Behavior:** Either soft-delete (set status = archived) or hard-delete. Recommend soft: set `status = 'archived'` so download history is preserved.

**Response 200:**

```json
{
  "message": "Listing archived"
}
```

---

### 5.6 My Listings (Protected)

**GET** `/api/v1/marketplace/listings/mine`

**Auth:** Required.

**Query:** Optional `status` filter.

**Response 200:**

```json
{
  "listings": [ /* same shape as list, without downloaded */ ]
}
```

---

### 5.7 Download Listing (Protected)

**POST** `/api/v1/marketplace/listings/:id/download`

**Auth:** Required.

**Body:** Empty or `{}`.

**Behavior:**

1. Validate listing exists and is `active`.
2. If paid (price_cents > 0), validate payment (Phase 2: require Stripe payment_intent confirmation or idempotency key).
3. If user already has a row in `marketplace_downloads` for this listing, return 200 with `already_downloaded: true` and existing or new agent id (no duplicate agent created).
4. Load source agent (must belong to listing owner); copy name, description, instruction, icon_name; create new agent for current user with same fields; copy agent_skills to the new agent.
5. Insert row into `marketplace_downloads` (listing_id, user_id).
6. Increment `marketplace_listings.download_count`.
7. Return the new (or existing) agent.

**Response 200:**

```json
{
  "agent": {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "instruction": "string",
    "icon_name": "string",
    "skill_ids": ["web_search"],
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  },
  "already_downloaded": false
}
```

**Errors:**

- 402: Payment required (paid listing and no valid payment).
- 404: Listing not found or not active.

---

### 5.8 Check Downloaded (Protected, Optional)

**GET** `/api/v1/marketplace/listings/:id/downloaded`

**Auth:** Required.

**Response 200:**

```json
{
  "downloaded": true
}
```

Useful to avoid an extra round-trip in list/detail if the client already has list/detail with `downloaded` from server.

---

### 5.9 Error Response Format (All Endpoints)

Consistent with existing GenZ API:

```json
{
  "error": "error_code",
  "message": "Human-readable message"
}
```

**HTTP status:** 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 402 Payment Required (paid), 500 Internal Server Error.

---

## 6. Client Flows & Screens

### 6.1 Navigation Changes

- **Option A (recommended):** Add a new tab **“Marketplace”** (or “Discover”) in `MainTabs` (e.g. between Agents and Settings). Tab opens a stack: Marketplace (list) → MarketplaceDetail (detail) → optional PublishListing / EditListing.
- **Option B:** Add “Marketplace” as a screen inside the Agents stack (e.g. “Discover” at top of AgentsScreen that navigates to Marketplace stack).

**New routes (suggested):**

- `MainTabsParamList`: add `Marketplace: undefined` (if new tab).
- `MarketplaceStackParamList` (if new stack): `MarketplaceList`, `MarketplaceDetail: { listingId: string }`, `PublishListing: { agentId: string }`, `EditListing: { listingId: string }`, `MyListings`.

### 6.2 Screens

| Screen | Purpose | Key actions |
|--------|---------|-------------|
| **MarketplaceScreen** | List public listings; cards with title, publisher, price, download count. | Filters: category, sort (recent/popular). Tap card → detail. Optional: “My listings” button. |
| **MarketplaceDetailScreen** | Single listing: title, summary, agent name/description, skills, price. | “Add to my agents” / “Download” (or “Buy” if paid). If already downloaded: “In your agents” + link to open agent. |
| **MyListingsScreen** | Creator’s listings (from GET mine). | Create new (→ pick agent → PublishListing), Edit, Unpublish (archive). |
| **PublishListingScreen** | Create listing from an agent. | Pick agent (from my agents), form: title, summary, category, price (if Phase 2), status draft/active. Submit → create listing. |
| **EditListingScreen** | Edit existing listing. | Same form as publish; prefill from listing; do not change agent_id. |

### 6.3 Key Flows

- **Publish:** AgentsScreen or EditAgentScreen → “Publish to Marketplace” → PublishListingScreen (or pick agent first) → submit → redirect to My Listings or Marketplace.
- **Download:** MarketplaceDetailScreen → “Add to my agents” → POST download → success toast → optionally navigate to Agents tab and highlight new agent.
- **Already downloaded:** List and detail show “In your agents” / disabled button; GET list and GET detail return `downloaded: true` when authenticated.

### 6.4 Client API Layer (TypeScript)

**Types** (e.g. in `client/src/types/marketplace.ts` or in `api.ts`):

- `MarketplaceListing`, `MarketplaceListingDetail`, `MarketplaceDownloadResponse`, `CreateListingPayload`, `UpdateListingPayload`.

**API functions** (in `client/src/services/api.ts` or `marketplace.ts`):

- `listMarketplaceListings(params?, token?)`, `getMarketplaceListing(id, token?)`, `createMarketplaceListing(payload, token)`, `updateMarketplaceListing(id, payload, token)`, `deleteMarketplaceListing(id, token)`, `getMyListings(token)`, `downloadMarketplaceListing(id, token)`, `checkListingDownloaded(id, token)` (optional).

---

## 7. Security & RLS

- **Listings:** Public can only SELECT rows with `status = 'active'` or own rows. Insert/Update/Delete only when `user_id = auth.uid()`. Backend uses service role for create/update/download so it can validate agent ownership and insert into `marketplace_downloads`.
- **Downloads:** Users can only SELECT their own rows. No client-side INSERT; only backend (service role) inserts after validating listing and (if paid) payment.
- **Instruction:** Never expose in list or public detail; only used when copying agent on download.
- **Knowledge base:** Not copied in v1; no cross-user access to KB docs.

---

## 8. Monetization (Payments)

### 8.1 Phase 2: Stripe Integration

- **Stripe product:** One-time payment per listing (or per “purchase”); no subscriptions in v1.
- **Flow:** Client requests “Buy” → Backend creates PaymentIntent (or Checkout Session) with amount = listing.price_cents / 100, metadata: listing_id, user_id. Client completes payment; Stripe webhook confirms payment → Backend records purchase (e.g. insert `marketplace_downloads` with payment_id or a separate `marketplace_purchases` table). Client then calls POST download; backend checks purchase (or download record) and performs copy.
- **Idempotency:** Ensure one purchase per user per listing (same as download uniqueness).
- **Payouts:** Stripe Connect for creator payouts, or manual; document in business rules.

### 8.2 Optional: `marketplace_purchases` Table (Phase 2)

If you want to separate “payment” from “download” (e.g. allow download multiple times after one purchase):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| listing_id | UUID | FK marketplace_listings |
| user_id | UUID | FK profiles |
| payment_id | TEXT | Stripe PaymentIntent id |
| amount_cents | INT | |
| created_at | TIMESTAMPTZ | |

Unique (listing_id, user_id). Then POST download checks for either a row in `marketplace_downloads` or `marketplace_purchases` for this user and listing.

---

## 9. Implementation Checklist

### File Manifest (New or Modified Files)

| Layer | File | Action |
|-------|------|--------|
| Server | `server/migrations/008_marketplace_listings.sql` | Create |
| Server | `server/migrations/009_marketplace_rls.sql` | Create |
| Server | `server/models/marketplace.go` | Create |
| Server | `server/handlers/marketplace.go` | Create |
| Server | `server/routes/routes.go` | Modify (add marketplace group + routes) |
| Client | `client/src/types/marketplace.ts` (or in `types/index.ts`) | Create or extend |
| Client | `client/src/services/api.ts` (or `services/marketplace.ts`) | Extend / Create |
| Client | `client/src/screens/MarketplaceScreen.tsx` | Create |
| Client | `client/src/screens/MarketplaceDetailScreen.tsx` | Create |
| Client | `client/src/screens/MyListingsScreen.tsx` | Create |
| Client | `client/src/screens/PublishListingScreen.tsx` | Create |
| Client | `client/src/screens/EditListingScreen.tsx` (marketplace) | Create (or name `EditMarketplaceListingScreen.tsx`) |
| Client | `client/src/navigation/MainTabs.tsx` | Modify (add Marketplace tab if Option A) |
| Client | `client/src/navigation/AgentsStack.tsx` or new `MarketplaceStack.tsx` | Modify / Create |
| Client | `client/src/types/navigation.ts` | Modify (add Marketplace params) |
| Client | `client/src/screens/AgentsScreen.tsx` or `EditAgentScreen.tsx` | Modify (add “Publish to Marketplace” entry) |
| Client | `client/src/screens/index.ts` | Modify (export new screens) |

### Backend (Go + Supabase)

- [ ] Add migration `008_marketplace_listings.sql` (tables, indexes, trigger).
- [ ] Add migration `009_marketplace_rls.sql` (RLS policies).
- [ ] Add `server/models/marketplace.go` (listing, download structs).
- [ ] Add `server/handlers/marketplace.go`: ListListings, GetListing, CreateListing, UpdateListing, DeleteListing, MyListings, DownloadListing, optional CheckDownloaded.
- [ ] In handlers: validate agent ownership on create; validate listing ownership on update/delete; on download: copy agent + skills, insert download, increment count.
- [ ] Register routes in `server/routes/routes.go`:
  - **Public** (no auth): `GET /marketplace/listings`, `GET /marketplace/listings/:id`
  - **Protected**: `POST /marketplace/listings`, `PUT /marketplace/listings/:id`, `DELETE /marketplace/listings/:id`, `GET /marketplace/listings/mine`, `POST /marketplace/listings/:id/download`, optional `GET /marketplace/listings/:id/downloaded`
- [ ] (Phase 2) Stripe webhook + purchase recording; download handler checks payment for paid listings.

### Client (React Native)

- [ ] Add types for listing, create/update payload, download response.
- [ ] Add API functions for all marketplace endpoints (list, get, create, update, delete, mine, download).
- [ ] Add Marketplace tab or entry in Agents stack; add MarketplaceStack (list, detail, my listings, publish, edit).
- [ ] Implement MarketplaceScreen (list + filters + cards).
- [ ] Implement MarketplaceDetailScreen (detail + Download / Already have it).
- [ ] Implement MyListingsScreen (list mine; create, edit, unpublish).
- [ ] Implement PublishListingScreen (pick agent, form, submit).
- [ ] Implement EditListingScreen (prefill, submit).
- [ ] Add “Publish to Marketplace” from AgentsScreen or EditAgentScreen (navigate to PublishListing with agentId or picker).
- [ ] After download success: refresh agents list; optionally navigate to Agents tab.

### Docs & Config

- [ ] Keep this planning doc updated as implementation progresses.
- [ ] (Phase 2) Document Stripe env vars and webhook URL in README or config.

---

## 10. Testing & Rollout

- **Unit:** Handlers: create listing (agent owned / not owned), download (free, already downloaded), copy agent fields and skills.
- **Integration:** Full flow: create agent → create listing → second user downloads → second user has new agent with same config.
- **RLS:** Verify unauthenticated can read only active listings; authenticated can only update/delete own listings; only backend can insert downloads.
- **Rollout:** Feature flag “marketplace” (optional); run migrations in staging first; then enable tab/screen in production.

---

**End of document.**
