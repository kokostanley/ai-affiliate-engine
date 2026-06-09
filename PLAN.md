# End-to-End Affiliate Link Tracking System

## Overview
Implement a unified tracking system that follows every affiliate link from creation to conversion, providing complete visibility into the content pipeline and performance metrics.

## Current State Analysis

### What's Missing:
1. No unified tracking record per affiliate link
2. No pipeline visibility for link lifecycle
3. No per-link performance analytics dashboard
4. No link status management (pause/activate)
5. Click tracking not fully integrated with distribution flow

### What Exists:
- `Link` model with ClickLog (basic tracking)
- `DistributionQueue.affiliateLink` + `trackingLink`
- `RevenueEvent` for CLICK, LEAD, SALE events
- `/showflow` command (pipeline overview but not per-link)
- `/api/affiliate/` routes (partial tracking)

---

## Implementation Plan

### Phase 1: Database Schema

**File:** `prisma/schema.prisma`

Add two new models:

```prisma
model AffiliateLinkTracking {
  id              String    @id @default(cuid())

  // Core references
  productId      String?
  contentId      String?
  distributionId String?
  brandId        String?

  // Link info
  originalLink   String    // Raw affiliate link
  trackingLink   String    // With UTM parameters
  shortCode      String?   // Short tracking code

  // Pipeline stage
  pipelineStage   String    @default("PRODUCT_CREATED")
  // Stages: PRODUCT_CREATED | CONTENT_GENERATED | APPROVED | DISTRIBUTED | POSTED | ACTIVE | PAUSED | EXPIRED

  // Pipeline history (JSON array of changes)
  pipelineHistory Json      @default("[]")

  // Cumulative stats
  clicks          Int       @default(0)
  uniqueClicks    Int       @default(0)
  leads           Int       @default(0)
  sales           Int       @default(0)
  revenue         Float     @default(0)
  commission      Float     @default(0)

  // Link metadata
  platform        String?   // TIKTOK, INSTAGRAM, etc.
  contentType     String?   // VIDEO, IMAGE, CAROUSEL
  provider        String?   // PIPPIT_MANUAL, HIGGSFIELD_AUTO, etc.
  postUrl         String?
  postId          String?
  postedAt        DateTime?

  // Status management
  status          String    @default("ACTIVE") // ACTIVE | PAUSED | EXPIRED

  // UTM source tracking
  utmSource       String?
  utmMedium       String?
  utmCampaign     String?

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([brandId])
  @@index([pipelineStage])
  @@index([status])
  @@index([distributionId])
}

model LinkEventLog {
  id             String    @id @default(cuid())
  trackingId     String
  tracking       AffiliateLinkTracking @relation(fields: [trackingId], references: [id])

  // Event type
  eventType      String    // CLICK | LEAD | SALE | STAGE_CHANGE | STATUS_CHANGE

  // Values
  revenue        Float     @default(0)
  commission     Float     @default(0)

  // Attribution
  ipAddress      String?
  userAgent      String?
  country        String?
  device         String?   // MOBILE | DESKTOP | TABLET

  // Metadata
  metadata       Json?     // Additional event data

  createdAt      DateTime  @default(now())

  @@index([trackingId])
  @@index([eventType])
  @@index([createdAt])
}
```

**Run:** `npx prisma db push`

---

### Phase 2: Service Layer

**File:** `src/services/link-tracking.ts` (NEW)

```typescript
// Core functions:
// - createTrackingRecord(distributionId, data) - Create tracking when distribution created
// - updatePipelineStage(trackingId, stage) - Update as content moves through pipeline
// - recordEvent(trackingId, eventType, data) - Record clicks, leads, sales
// - getLinkStats(trackingId) - Get full stats for a link
// - getAllLinks(filters) - List all links with filters
// - pauseLink(trackingId) / activateLink(trackingId) - Status management
// - getAggregateStats(brandId) - Aggregate stats by brand/platform
```

**Key Logic:**
- Auto-generate shortCode from timestamp + random
- Store pipeline changes with timestamps in history
- Check for unique clicks (same IP in 24h)
- Update distributionQueue stats when recording events

---

### Phase 3: API Routes

**File:** `src/app/routes/links-tracking.ts` (NEW)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/links/tracking` | List all tracked links with filters |
| GET | `/api/links/tracking/stats` | Get aggregate stats |
| GET | `/api/links/tracking/:id` | Get detailed tracking |
| POST | `/api/links/tracking` | Create tracking (internal) |
| PATCH | `/api/links/tracking/:id` | Update status/stage |
| POST | `/api/links/tracking/:id/events` | Record event |
| GET | `/api/links/tracking/:id/stats` | Get stats for specific link |

**Register in `src/app/server.ts`:**
```typescript
import linksTrackingRouter from './routes/links-tracking';
app.use('/api/links', linksTrackingRouter);
```

---

### Phase 4: Telegram Bot Command

**File:** `src/bot/commands/linktrack.ts` (NEW)

Command: `/linktrack [linkId|distributionId]`

**Shows:**
```
🔗 LINK TRACKING STATUS
─────────────────────
📦 Product: [name]
📱 Platform: [platform]
🔄 Stage: [pipeline stage emoji] [stage name]
─────────────────────
📊 PERFORMANCE
├ Clicks: [n] ([unique] unique)
├ Leads: [n]
├ Sales: [n]
└ Revenue: Rp [amount]
─────────────────────
⏱️ Created: [date]
📍 Post: [postUrl | not posted]
─────────────────────
[Buttons: Pause | Activate | View Details]
```

---

### Phase 5: UI Page

**File:** `src/app/links/page.tsx` (UPDATE existing)

**Components:**
1. **Stats Header** - 4 cards: Total Links, Active, Total Clicks, Total Revenue
2. **Filter Bar** - Brand dropdown, Platform dropdown, Status filter
3. **Links Table:**
   - Columns: Link (truncated), Product, Platform, Stage, Clicks, Leads, Sales, Revenue, Status, Actions
   - Row expansion for details
   - Status badges (color-coded)
4. **Quick Actions** - Pause, Activate, View Stats per row

**Design:** Dark theme matching existing pages (Tailwind)

---

### Phase 6: Integration Points

**A. `src/services/distribution.ts`**
- After `createDistribution()`, call `createTrackingRecord()`
- Pass: distributionId, brandId, productId, contentType, platform, affiliateLink, trackingLink

**B. `src/services/approval-pipeline.ts`**
- After `executeApprovalPipeline()`, call `updatePipelineStage()` with stage `APPROVED`

**C. `src/bot/index.ts`**
- In `/add` command, create initial tracking record with stage `PRODUCT_CREATED`
- Update to `CONTENT_GENERATED` after content created

---

## Files to Create/Modify

| Phase | Action | File |
|-------|--------|------|
| 1 | Update | `prisma/schema.prisma` |
| 2 | Create | `src/services/link-tracking.ts` |
| 3 | Create | `src/app/routes/links-tracking.ts` |
| 3 | Update | `src/app/server.ts` |
| 4 | Create | `src/bot/commands/linktrack.ts` |
| 4 | Update | `src/bot/index.ts` |
| 5 | Update | `src/app/links/page.tsx` |
| 6 | Update | `src/services/distribution.ts` |
| 6 | Update | `src/services/approval-pipeline.ts` |

---

## Pipeline Stages Flow

```
PRODUCT_CREATED ──→ CONTENT_GENERATED ──→ APPROVED ──→ DISTRIBUTED ──→ POSTED ──→ ACTIVE
                              │                │           │
                              │                │           └── (auto-updates via distribution)
                              │                │
                              └── (from approval pipeline)
```

**Stage Updates:**
1. `/add` command → `PRODUCT_CREATED`
2. Content generated → `CONTENT_GENERATED`
3. Content approved → `APPROVED`
4. Distribution created → `DISTRIBUTED`
5. Posted confirmed → `POSTED` → `ACTIVE`
6. Manual pause → `PAUSED`
7. Manual expire → `EXPIRED`

---

## Verification Checklist

After implementation:
1. [ ] Run `npx prisma db push` - new tables created
2. [ ] Add product via `/add` - tracking record created with stage PRODUCT_CREATED
3. [ ] Approve content - stage updates to APPROVED
4. [ ] Create distribution - stage updates to DISTRIBUTED
5. [ ] Post to Zernio - stage updates to ACTIVE
6. [ ] Use `/linktrack` command - shows correct stage and stats
7. [ ] Visit `/links` page - shows all tracked links
8. [ ] Test pause/activate - status updates correctly
9. [ ] Check LinkEventLog - events recorded properly

---

## Commands Summary

| Command | Description |
|---------|-------------|
| `/linktrack` | Show all tracked links summary |
| `/linktrack [id]` | Show detailed tracking for specific link |
| `/linktrack pause [id]` | Pause a link |
| `/linktrack activate [id]` | Activate a paused link |

---

## API Usage Examples

```bash
# Get all tracked links
curl http://localhost:3000/api/links/tracking

# Get links for specific brand
curl http://localhost:3000/api/links/tracking?brandId=xxx

# Get detailed tracking
curl http://localhost:3000/api/links/tracking/:id

# Record a click event
curl -X POST http://localhost:3000/api/links/tracking/:id/events \
  -H "Content-Type: application/json" \
  -d '{"eventType":"CLICK","ipAddress":"1.2.3.4"}'

# Pause a link
curl -X PATCH http://localhost:3000/api/links/tracking/:id \
  -H "Content-Type: application/json" \
  -d '{"action":"pause"}'
```