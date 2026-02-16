# CannaSignal UI/UX Stack Recommendations

> Strategic Technical Decisions for a Cannabis Market Intelligence Platform

**Date:** 2026-02-16  
**Author:** Technical Research Analysis  
**Status:** Recommendation

---

## Executive Summary

After analyzing CannaSignal's requirements — real-time data, complex dashboards, Convex backend, Cloudflare infrastructure, and lean team constraints — the **recommended stack** is:

| Layer | Recommendation | Runner-up |
|-------|---------------|-----------|
| **Framework** | React + Vite SPA | Next.js (via OpenNext) |
| **Routing** | TanStack Router | React Router v6 |
| **State/Data** | Convex `useQuery` + TanStack Query | Convex native only |
| **UI Components** | shadcn/ui + Radix | Tremor |
| **Charts** | Tremor charts (Recharts wrapper) | Apache ECharts |
| **Styling** | Tailwind CSS v4 | - |
| **Deployment** | Cloudflare Pages (static) | Workers SSR |
| **Real-time** | Convex subscriptions | Durable Objects |
| **AI Features** | Workers AI + Convex Actions | OpenAI direct |

**Why this stack wins:** Maximum developer velocity, native Convex integration, enterprise-grade components, and clean separation between the SPA dashboard and the existing Hono API.

---

## 1. Framework Analysis

### The Contenders

| Framework | Performance | Real-time DX | Cloudflare Fit | Talent Pool | Verdict |
|-----------|-------------|--------------|----------------|-------------|---------|
| **React + Vite** | ★★★★☆ | ★★★★★ | ★★★★★ | ★★★★★ | **Winner** |
| Next.js | ★★★★☆ | ★★★★☆ | ★★★☆☆ | ★★★★★ | Complex for SPA |
| SolidJS | ★★★★★ | ★★★☆☆ | ★★★★★ | ★★☆☆☆ | No Convex support |
| Svelte 5 | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★★★☆☆ | Limited ecosystem |

### Why React + Vite SPA

**1. Perfect Convex Integration**
```typescript
// This "just works" with Convex
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function InventoryDashboard() {
  // Real-time subscription — updates automatically when data changes
  const alerts = useQuery(api.alerts.getActive);
  const retailers = useQuery(api.retailers.list, { region: "nyc" });
  
  // When ANY user triggers an alert, ALL subscribed dashboards update
  // No WebSocket plumbing, no polling, no cache invalidation
  return <AlertList alerts={alerts} />;
}
```

**2. Dashboard Pattern Fit**
- Dashboards are behind authentication (no SEO needed)
- All data is real-time from Convex (no static generation benefit)
- Single deployment artifact to Cloudflare Pages
- No server-side complexity = fewer failure modes

**3. SPA vs SSR Decision Matrix**

| Criterion | SPA (Vite) | SSR (Next.js) | Winner for CannaSignal |
|-----------|------------|---------------|------------------------|
| SEO requirements | ❌ None (behind login) | ✅ Strong | **SPA** |
| Initial load speed | Slower | Faster | Draw (dashboard users wait anyway) |
| Real-time updates | Native with Convex | Needs hydration | **SPA** |
| Deployment complexity | Static files | Requires Workers/Node | **SPA** |
| Cloudflare native | ✅ Pages only | ⚠️ Needs OpenNext | **SPA** |
| Development speed | ✅ Faster iteration | Slower (server/client split) | **SPA** |

**4. When to Reconsider**
- If you add a public marketing site with SEO needs → Add Astro or Next.js for that
- If you need server actions → Convex Actions cover this already

---

## 2. Routing: TanStack Router

### Why TanStack Router > React Router

```typescript
// tanstack-router: Type-safe, file-based routing
// routes/dashboard/alerts/$alertId.tsx

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

// Full type safety: params, search params, loader data
export const Route = createFileRoute('/dashboard/alerts/$alertId')({
  validateSearch: z.object({
    tab: z.enum(['details', 'history', 'related']).optional(),
  }),
  loader: async ({ params }) => {
    // Pre-load data before rendering
    return { alertId: params.alertId };
  },
  component: AlertDetailPage,
});

function AlertDetailPage() {
  const { alertId } = Route.useParams(); // Type-safe!
  const { tab } = Route.useSearch();      // Type-safe!
  // ...
}
```

**Benefits:**
- **Type-safe everything** — params, search params, loaders
- **File-based routing** — matches Next.js ergonomics
- **Built-in data loading** — integrates with TanStack Query
- **Search param state** — perfect for dashboard filters (date ranges, retailer selection)
- **Parallel routes** — multiple panels updating independently

### File Structure

```
src/
├── routes/
│   ├── __root.tsx              # Layout wrapper
│   ├── index.tsx               # Landing/redirect
│   ├── login.tsx
│   └── dashboard/
│       ├── __layout.tsx        # Dashboard shell (sidebar, nav)
│       ├── index.tsx           # Overview/home
│       ├── alerts/
│       │   ├── index.tsx       # Alert list
│       │   └── $alertId.tsx    # Alert detail
│       ├── retailers/
│       │   ├── index.tsx       # Retailer grid
│       │   └── $retailerId.tsx # Retailer detail
│       ├── brands/
│       │   └── ...
│       ├── analytics.tsx       # Charts/trends
│       └── settings.tsx
```

---

## 3. Data Layer: Convex + TanStack Query

### Why Both?

**Convex provides:**
- Real-time subscriptions (`useQuery` auto-updates)
- Mutations with optimistic updates
- Type-safe API from schema

**TanStack Query adds:**
- Suspense support for loading states
- Parallel query coordination
- Better devtools for debugging
- Caching for non-real-time data (e.g., user preferences)

### Integration Pattern

```typescript
// lib/convex-query.ts
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../convex/_generated/api";

// Use TanStack Query wrapper for Convex queries
export const alertsQueryOptions = (filters: AlertFilters) =>
  convexQuery(api.alerts.list, filters);

// In component
function AlertsPage() {
  const { data: alerts, isPending } = useSuspenseQuery(
    alertsQueryOptions({ status: "active", region: "nyc" })
  );
  
  // Still real-time! But with better loading UX
  if (isPending) return <AlertsSkeleton />;
  return <AlertsGrid alerts={alerts} />;
}
```

### When to Use What

| Data Type | Tool | Why |
|-----------|------|-----|
| Live inventory | `useQuery` (Convex) | Real-time critical |
| Active alerts | `useQuery` (Convex) | Real-time critical |
| User settings | TanStack Query | Cacheable, rarely changes |
| Historical charts | TanStack Query | Pre-fetched, not live |
| Auth state | Convex Auth hooks | Built-in |

---

## 4. UI Components: shadcn/ui + Radix

### Why shadcn/ui

1. **Not a library, but code you own**
   - Components copied into your codebase
   - Full customization without fighting abstractions
   - No version lock-in

2. **Built on Radix primitives**
   - Accessible by default (WCAG compliant)
   - Headless components with your styling
   - Handles keyboard navigation, focus management

3. **Tailwind-native**
   - Matches your existing styling approach
   - Dark mode built-in
   - Consistent design tokens

### Installation

```bash
# Initialize shadcn/ui in Vite project
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add button card dialog dropdown-menu
npx shadcn@latest add table data-table tabs avatar badge
```

### Key Components for CannaSignal

```
shadcn components to install:
├── Layout: sidebar, navigation-menu, breadcrumb
├── Data Display: table, data-table, card, badge, avatar
├── Charts: chart (uses Recharts internally)
├── Inputs: input, select, combobox, date-picker
├── Feedback: alert, toast, dialog, sheet
├── Navigation: tabs, command (for search)
```

### Component Example

```tsx
// components/alerts/alert-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AlertCardProps {
  alert: Alert;
  className?: string;
}

export function AlertCard({ alert, className }: AlertCardProps) {
  return (
    <Card className={cn("hover:border-primary/50 transition-colors", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {alert.retailerName}
        </CardTitle>
        <Badge variant={alert.type === "out_of_stock" ? "destructive" : "default"}>
          {alert.type.replace("_", " ")}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {alert.productName} • {formatDistanceToNow(alert.triggeredAt)} ago
        </p>
      </CardContent>
    </Card>
  );
}
```

---

## 5. Data Visualization: Tremor + Apache ECharts

### Primary: Tremor Charts

**Why Tremor for dashboards:**
- Built specifically for analytics dashboards
- Beautiful defaults, minimal configuration
- Tailwind-native styling
- Built on Recharts (what you already have!)

```tsx
import { AreaChart, Card, Title, Text } from "@tremor/react";

const inventoryData = [
  { date: "Feb 1", "In Stock": 234, "Low Stock": 45, "Out of Stock": 12 },
  { date: "Feb 2", "In Stock": 228, "Low Stock": 52, "Out of Stock": 15 },
  // ...
];

export function InventoryTrendChart() {
  return (
    <Card>
      <Title>Inventory Levels</Title>
      <Text>Last 30 days across monitored retailers</Text>
      <AreaChart
        className="h-72 mt-4"
        data={inventoryData}
        index="date"
        categories={["In Stock", "Low Stock", "Out of Stock"]}
        colors={["emerald", "yellow", "rose"]}
        valueFormatter={(n) => n.toLocaleString()}
      />
    </Card>
  );
}
```

### Secondary: Apache ECharts (for complex visualizations)

**When to use ECharts instead:**
- Large datasets (10,000+ data points)
- Complex chart types (sankey, treemap, heatmap calendar)
- Heavy interaction requirements
- Canvas rendering needed for performance

```tsx
import ReactECharts from 'echarts-for-react';

export function PriceHeatmapCalendar({ data }: { data: PricePoint[] }) {
  const option = {
    tooltip: { position: 'top' },
    visualMap: {
      min: 0, max: 100,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 0
    },
    calendar: {
      top: 60,
      left: 30,
      right: 30,
      cellSize: ['auto', 13],
      range: '2026',
      itemStyle: { borderWidth: 0.5 },
      yearLabel: { show: false }
    },
    series: {
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: data.map(d => [d.date, d.priceChange])
    }
  };

  return <ReactECharts option={option} style={{ height: '200px' }} />;
}
```

### Chart Library Decision Matrix

| Use Case | Library | Why |
|----------|---------|-----|
| Line/Area charts | Tremor | Simple, beautiful defaults |
| Bar charts | Tremor | Consistent with rest of UI |
| Donut/Pie charts | Tremor | Dashboard standard |
| Data tables with mini-charts | Tremor SparkChart | Inline sparklines |
| Calendar heatmaps | ECharts | Not available in Tremor |
| Sankey diagrams | ECharts | Brand → Retailer flow |
| Large dataset scatter | ECharts | Canvas performance |
| Geographic maps | ECharts or Mapbox | Store locations |

---

## 6. Cloudflare Integration Architecture

### Deployment Model

```
┌──────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Cloudflare Pages│  │ Cloudflare      │  │ Cloudflare      │  │
│  │ (Static SPA)    │  │ Workers (API)   │  │ Workers AI      │  │
│  │                 │  │                 │  │                 │  │
│  │ • Dashboard     │  │ • /api/* (Hono) │  │ • Embeddings    │  │
│  │ • React app     │  │ • Auth proxy    │  │ • Summarization │  │
│  │ • Static assets │  │ • Rate limiting │  │ • Anomaly detect│  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           │         ┌─────────────────────┐        │           │
│           │         │   Durable Objects   │        │           │
│           │         │                     │        │           │
│           │         │ • WebSocket sessions│        │           │
│           │         │ • Alert aggregation │        │           │
│           │         │ • Rate limit state  │        │           │
│           │         └─────────────────────┘        │           │
│           │                    │                    │           │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                         CONVEX CLOUD                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Real-time DB    │  │ Scheduled Jobs  │  │ Convex Actions  │  │
│  │                 │  │                 │  │                 │  │
│  │ • Retailers     │  │ • Scrape crons  │  │ • Call Workers  │  │
│  │ • Products      │  │ • Alert crons   │  │ • External APIs │  │
│  │ • Alerts        │  │ • Cleanup       │  │ • AI inference  │  │
│  │ • Subscriptions │  │                 │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Pages Configuration

```toml
# wrangler.toml (for Pages)
name = "cannasignal-dashboard"
compatibility_date = "2024-09-23"

[site]
bucket = "./dist"

# Static asset caching
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# SPA fallback
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### When to Use Durable Objects

**Use Durable Objects for:**

1. **WebSocket connections** (if you add beyond Convex subscriptions)
   ```typescript
   // DO for real-time presence indicators
   export class UserPresence extends DurableObject {
     async handleWebSocket(ws: WebSocket) {
       // Track who's viewing which retailer
     }
   }
   ```

2. **Rate limiting per-user**
   ```typescript
   export class RateLimiter extends DurableObject {
     async checkLimit(userId: string): Promise<boolean> {
       const count = await this.storage.get<number>(`requests:${userId}`) ?? 0;
       if (count > 100) return false;
       await this.storage.put(`requests:${userId}`, count + 1);
       return true;
     }
   }
   ```

3. **Alert aggregation** (dedupe rapid-fire alerts)
   ```typescript
   export class AlertAggregator extends DurableObject {
     private pendingAlerts: Map<string, Alert> = new Map();
     
     async queueAlert(alert: Alert) {
       // Dedupe by product+retailer, batch send every 5 min
       const key = `${alert.retailerId}:${alert.productId}`;
       this.pendingAlerts.set(key, alert);
     }
   }
   ```

**Don't use Durable Objects for:**
- Primary data storage (use Convex)
- Simple request/response APIs (use Workers)
- Static content (use Pages)

### Workers AI for Intelligence Features

```typescript
// workers/ai-insights.ts
import { Ai } from '@cloudflare/ai';

export async function generatePriceInsight(
  ai: Ai,
  priceHistory: PricePoint[]
): Promise<string> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: 'You are a cannabis market analyst. Provide brief, actionable insights.'
      },
      {
        role: 'user',
        content: `Analyze this price history and identify trends: ${JSON.stringify(priceHistory)}`
      }
    ],
    max_tokens: 150
  });
  
  return response.response;
}

// For embeddings (product similarity search)
export async function embedProduct(ai: Ai, description: string) {
  const { data } = await ai.run('@cf/baai/bge-base-en-v1.5', {
    text: [description]
  });
  return data[0]; // 768-dim vector
}
```

---

## 7. Scaling Strategy

### Traffic Estimates

| Tier | Dashboard Users | API Calls/Day | Convex Queries/Day | Estimated Cost |
|------|-----------------|---------------|-------------------|----------------|
| **Launch** | 5-10 | 10K | 100K | ~$50/mo |
| **Growth** | 50-100 | 100K | 1M | ~$200/mo |
| **Scale** | 500+ | 1M | 10M | ~$1,500/mo |

### Convex Scaling Considerations

**Query Optimization:**
```typescript
// BAD: Fetching everything
export const getAllProducts = query({
  handler: async (ctx) => {
    return await ctx.db.query("products").collect(); // 💀 Don't do this
  },
});

// GOOD: Paginated, indexed queries
export const getProducts = query({
  args: {
    retailerId: v.id("retailers"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { retailerId, cursor, limit = 50 }) => {
    let query = ctx.db
      .query("products")
      .withIndex("by_retailer", q => q.eq("retailerId", retailerId));
    
    if (cursor) {
      query = query.filter(q => q.gt(q.field("_creationTime"), cursor));
    }
    
    const products = await query.take(limit + 1);
    const hasMore = products.length > limit;
    
    return {
      products: products.slice(0, limit),
      nextCursor: hasMore ? products[limit - 1]._creationTime : null,
    };
  },
});
```

**Subscription Optimization:**
```typescript
// Debounce real-time updates for charts (no need for millisecond updates)
import { useQuery } from "convex/react";
import { useDebouncedValue } from "@mantine/hooks";

function InventoryChart() {
  const rawData = useQuery(api.analytics.inventoryTrend);
  const [data] = useDebouncedValue(rawData, 1000); // Update chart max 1/sec
  
  return <AreaChart data={data} />;
}
```

### CDN/Caching Strategy

```typescript
// In Hono API Worker
app.get('/api/analytics/trends/:period', async (c) => {
  const period = c.req.param('period');
  
  // Cache historical data aggressively
  if (period !== 'today') {
    c.header('Cache-Control', 'public, max-age=3600'); // 1 hour
  } else {
    c.header('Cache-Control', 'public, max-age=60'); // 1 minute for "today"
  }
  
  const data = await convex.query(api.analytics.trends, { period });
  return c.json(data);
});
```

### Cost Optimization

| Strategy | Impact | Implementation |
|----------|--------|----------------|
| Paginate all lists | -50% bandwidth | Default 50 items, load more on scroll |
| Debounce chart updates | -30% function calls | 1 second minimum between renders |
| Cache static analytics | -40% function calls | Use TanStack Query for historical data |
| Compress API responses | -60% bandwidth | Hono compression middleware |
| Lazy load routes | -40% initial bundle | TanStack Router lazy imports |

---

## 8. Cost Estimates

### Monthly Infrastructure Costs

| Component | Launch (10 users) | Growth (100 users) | Scale (500 users) |
|-----------|-------------------|-------------------|-------------------|
| **Convex** |
| - Professional ($25/dev) | $25 | $75 (3 devs) | $125 (5 devs) |
| - Function calls | Included | $50 | $200 |
| - Database storage | Included | Included | $50 |
| - Database bandwidth | Included | $20 | $100 |
| **Cloudflare** |
| - Pages | Free | Free | Free |
| - Workers (API) | $5 | $5 | $25 |
| - Workers AI | $5 | $30 | $150 |
| - Durable Objects | $0 | $5 | $25 |
| **External Services** |
| - SendGrid (email) | Free tier | $20 | $90 |
| - Twilio (SMS) | $10 | $50 | $200 |
| **Total** | **~$45/mo** | **~$255/mo** | **~$965/mo** |

### Convex Pricing Deep Dive

**Professional Plan ($25/developer/month) includes:**
- 25M function calls/month (then $2/1M)
- 50 GB database storage (then $0.20/GB)
- 50 GB database bandwidth/month (then $0.20/GB)
- 256+ query/mutation concurrency
- Log streaming, custom domains

**Startup Program:** Up to 1 year free Professional + 30% off usage (apply at convex.dev/startups)

---

## 9. Stack Variants

### Option A: Fastest to Ship (Recommended)

```
React + Vite + TanStack Router + shadcn/ui + Tremor charts + Convex
Deploy: Cloudflare Pages (static)
Time to MVP: 2-3 weeks
```

**Pros:**
- Minimal configuration
- All tools have excellent docs
- You already have Vite + Convex experience
- Copy-paste components from shadcn/ui

**Cons:**
- SPA initial load slightly slower
- No SEO (but you don't need it)

### Option B: Maximum Performance

```
SolidJS + Vite + Solid Router + Kobalte + Apache ECharts
Deploy: Cloudflare Pages (static)
Time to MVP: 4-5 weeks
```

**Pros:**
- Fastest runtime performance (98 Lighthouse)
- Smallest bundle size
- True fine-grained reactivity

**Cons:**
- No official Convex adapter (you'd write one)
- Smaller ecosystem
- Fewer developers available to hire
- Learning curve for team

### Option C: Most Mature/Enterprise

```
Next.js 15 + OpenNext/Cloudflare + shadcn/ui + Tremor + Convex
Deploy: Cloudflare Workers (via OpenNext)
Time to MVP: 3-4 weeks
```

**Pros:**
- Largest ecosystem
- Most tutorials/resources
- Server Components for complex pages
- Easy to find developers

**Cons:**
- Cloudflare deployment via OpenNext adds complexity
- SSR overhead not needed for dashboard
- Larger bundle than SPA
- Framework lock-in stronger

### Option D: Budget Conscious

```
React + Vite + React Router + Tailwind (no component library) + Chart.js
Deploy: Cloudflare Pages (static)
Time to MVP: 3-4 weeks
```

**Pros:**
- Zero component library costs
- Minimal dependencies
- Full control

**Cons:**
- More custom CSS work
- Accessibility harder to get right
- Slower development

---

## 10. Implementation Roadmap

### Week 1: Foundation

```bash
# Initialize project
npm create vite@latest dashboard -- --template react-ts
cd dashboard

# Add dependencies
npm install @tanstack/react-router @tanstack/react-query convex react
npm install -D @tanstack/router-plugin tailwindcss postcss autoprefixer

# Initialize Tailwind
npx tailwindcss init -p

# Initialize shadcn/ui
npx shadcn@latest init

# Add core components
npx shadcn@latest add button card input label sidebar navigation-menu
npx shadcn@latest add table tabs badge avatar dropdown-menu dialog
```

### Week 2: Core Pages

1. **Authentication flow** (Convex Auth or Clerk)
2. **Dashboard layout** (sidebar, navigation)
3. **Retailers list** (with search/filter)
4. **Alerts feed** (real-time updates)

### Week 3: Analytics & Charts

1. **Install Tremor charts**
   ```bash
   npm install @tremor/react
   ```
2. **Inventory trends chart**
3. **Price history chart**
4. **Brand performance table**

### Week 4: Polish & Deploy

1. **Loading states** (Suspense boundaries)
2. **Error handling** (Error boundaries)
3. **Responsive design** (mobile-friendly)
4. **Deploy to Cloudflare Pages**

---

## 11. File Structure

```
cannasignal/
├── dashboard/                    # Frontend SPA
│   ├── src/
│   │   ├── routes/              # TanStack Router pages
│   │   │   ├── __root.tsx
│   │   │   ├── login.tsx
│   │   │   └── dashboard/
│   │   │       ├── __layout.tsx
│   │   │       ├── index.tsx
│   │   │       ├── alerts/
│   │   │       ├── retailers/
│   │   │       ├── brands/
│   │   │       └── analytics.tsx
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── charts/          # Tremor chart wrappers
│   │   │   ├── alerts/          # Alert-specific components
│   │   │   └── retailers/       # Retailer-specific components
│   │   ├── lib/
│   │   │   ├── utils.ts         # shadcn/ui utilities
│   │   │   ├── convex.ts        # Convex client setup
│   │   │   └── query.ts         # TanStack Query config
│   │   ├── hooks/               # Custom React hooks
│   │   ├── styles/
│   │   │   └── globals.css      # Tailwind imports
│   │   └── main.tsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── convex/                       # Backend (existing)
├── workers/                      # Cloudflare Workers (existing)
└── docs/
```

---

## 12. Key Links & Resources

### Documentation
- [Convex React Docs](https://docs.convex.dev/client/react)
- [Convex + TanStack Query](https://docs.convex.dev/client/tanstack/tanstack-query)
- [TanStack Router](https://tanstack.com/router/latest)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tremor](https://www.tremor.so/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)

### Starter Templates
- [shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter)
- [Tremor Dashboard Example](https://blocks.tremor.so/)
- [TanStack Router + Vite](https://github.com/TanStack/router/tree/main/examples/react/basic-file-based)

### Convex + Cloudflare
- [Convex HTTP Routes](https://docs.convex.dev/functions/http-actions)
- [Convex Actions](https://docs.convex.dev/functions/actions)
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)

---

## Final Recommendation

**Go with Option A: React + Vite SPA**

This is the optimal choice for CannaSignal because:

1. **Perfect Convex fit** — Real-time subscriptions work natively
2. **Cloudflare native** — Static deploy to Pages, no SSR complexity
3. **Developer velocity** — shadcn/ui + Tremor = fast iterations
4. **Future-proof** — TanStack Router can add SSR later if needed
5. **Team scalability** — React talent is abundant

Start simple, ship fast, iterate based on user feedback. The stack can evolve as the product grows.

---

*Document generated for strategic technical planning. Review with team before implementation.*
