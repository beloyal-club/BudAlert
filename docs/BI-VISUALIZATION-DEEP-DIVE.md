# CannaSignal BI/Visualization Deep Dive

> **Purpose:** Evaluate visualization stack options for fast, filterable cannabis market intelligence dashboards with 10K-100K inventory records.
> **Key Concern:** SVG-based rendering (Tremor/Recharts) may bottleneck during rapid filter operations.

---

## Executive Summary

**Recommendation:** Skip embedded BI tools. Build a custom visualization layer using:

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| **Charts** | **Apache ECharts** | Canvas-based, handles 100K+ points, dual SVG/Canvas renderer |
| **Geo/Maps** | **Deck.gl + MapLibre** | WebGL performance, free/open-source, heatmaps built-in |
| **Data Layer** | **Direct Convex** | Real-time subscriptions, server-side filtered queries |
| **Notifications** | **Convex Actions** | Trigger alerts on data changes via scheduled functions |

**Why not embedded BI?**
- Metabase/Superset require SQL database (not Convex-native)
- Iframe embedding adds latency, limits real-time updates
- Filter UX constrained by BI tool design
- Would need Convex → Warehouse → BI pipeline (adds complexity/lag)

---

## 1. Rendering Technology Comparison

### SVG vs Canvas vs WebGL

| Renderer | Best For | Performance (100K points) | Interactivity | Memory |
|----------|----------|---------------------------|---------------|--------|
| **SVG** | <1K elements | 🔴 Poor (DOM-heavy) | ✅ Excellent (CSS/events) | High |
| **Canvas** | 1K-500K elements | ✅ Excellent | ⚠️ Manual hit detection | Medium |
| **WebGL** | 500K+ elements, geo | ✅✅ Best | ⚠️ Complex | Low |

**Key Insight:** Canvas renders 10-100x faster than SVG for large datasets because it doesn't create DOM nodes per data point. When filtering 50K records, SVG must add/remove thousands of DOM nodes; Canvas just repaints.

### Benchmarks (approximate)

| Library | Renderer | 10K points | 50K points | 100K points |
|---------|----------|------------|------------|-------------|
| Recharts/Tremor | SVG | ~200ms | ~800ms | 🔴 Freezes |
| Chart.js | Canvas | ~50ms | ~150ms | ~400ms |
| Apache ECharts | Canvas | ~30ms | ~100ms | ~250ms |
| Deck.gl | WebGL | ~20ms | ~50ms | ~100ms |

---

## 2. Chart Library Analysis

### ❌ Tremor / shadcn/ui Charts (Current Stack Concern)

**Built on Recharts (SVG-based)**
- Beautiful out-of-box styling with Tailwind
- Good for small dashboards (<5K data points)
- **Problem:** Every filter operation triggers SVG DOM diff
- **Problem:** No virtualization for large datasets

**Verdict:** Fine for summary KPIs, not for filterable detail views.

---

### ✅ Apache ECharts (Recommended)

**Why ECharts for CannaSignal:**

1. **Dual Renderer:** Switch between SVG and Canvas per-chart
   ```javascript
   const chart = echarts.init(container, null, { renderer: 'canvas' });
   ```

2. **Large Data Mode:** Built-in optimization for 100K+ points
   ```javascript
   series: [{
     type: 'scatter',
     large: true,
     largeThreshold: 2000,
     data: bigDataset
   }]
   ```

3. **Progressive Rendering:** Chunked rendering prevents UI freeze
   ```javascript
   series: [{
     progressive: 400,
     progressiveThreshold: 3000
   }]
   ```

4. **Dataset Management:** Filter data efficiently
   ```javascript
   option = {
     dataset: {
       source: inventoryData,
       transform: {
         type: 'filter',
         config: { dimension: 'category', value: 'flower' }
       }
     }
   }
   ```

5. **React Integration:** `echarts-for-react` wrapper available

**Performance Tips:**
- Use `notMerge: true` when replacing data
- Debounce filter inputs (100-200ms)
- Consider `sampling` for line charts with huge datasets

---

### ⚠️ Chart.js

**Pros:**
- Lightweight (~60KB)
- Canvas-based, decent performance
- Simple API

**Cons:**
- Less chart variety than ECharts
- Limited large-data optimizations
- No built-in data transformation

**Verdict:** Good if simplicity trumps features. ECharts is more powerful for BI.

---

### ⚠️ Visx / D3

**Pros:**
- Maximum flexibility
- React-native (Visx)

**Cons:**
- SVG-based by default
- Requires custom optimization for large data
- More code to write

**Verdict:** Overkill for standard BI charts. Use for custom visualizations only.

---

## 3. Geo Visualization

### Comparison Matrix

| Library | Renderer | Heatmaps | 3D | Tiles | React | Cost |
|---------|----------|----------|-----|-------|-------|------|
| **Deck.gl** | WebGL | ✅ Built-in | ✅ | Via basemap | ✅ | Free |
| **Mapbox GL JS** | WebGL | ✅ | ✅ | ✅ | ✅ | Free tier, then paid |
| **MapLibre GL** | WebGL | ⚠️ Plugin | ✅ | ✅ | ✅ | Free |
| Leaflet | SVG/Canvas | ⚠️ Plugin | ❌ | ✅ | ✅ | Free |

### Recommendation: Deck.gl + MapLibre

**Why this combo:**

1. **Deck.gl HeatmapLayer:** Optimized for large point datasets
   ```javascript
   new HeatmapLayer({
     data: dispensaryLocations,
     getPosition: d => [d.longitude, d.latitude],
     getWeight: d => d.inventory_value,
     radiusPixels: 50
   })
   ```

2. **MapLibre:** Open-source fork of Mapbox GL, no API key required for base tiles

3. **Integration:** Deck.gl renders as Mapbox/MapLibre custom layer
   ```javascript
   import { MapboxOverlay } from '@deck.gl/mapbox';
   map.addControl(new MapboxOverlay({ layers: [heatmapLayer] }));
   ```

4. **NYS Dispensary Mapping:** 
   - ~200 licensed dispensaries (WebGL overkill but future-proof)
   - Can show inventory heatmaps by region
   - Cluster visualization for dense areas

**Alternative:** If Mapbox features needed (geocoding, directions), use Mapbox GL JS directly. Note: pricing kicks in at >50K map loads/month.

---

## 4. Embedded BI Evaluation

### Why Custom > Embedded for CannaSignal

| Factor | Embedded BI | Custom Components |
|--------|-------------|-------------------|
| **Real-time** | ⚠️ Polling (5-60s) | ✅ Convex subscriptions (instant) |
| **Filter UX** | Constrained by tool | Full control |
| **Convex Integration** | Requires warehouse | Direct |
| **Styling** | Limited theming | Native Tailwind |
| **Cost at scale** | $$$$ | Dev time only |
| **Mobile** | Iframe issues | Native responsive |

### If You MUST Use Embedded BI

**Best option: Cube.js (Headless BI)**

- API-first, no UI to embed
- Built-in caching layer (sub-second queries)
- Can connect to Convex via PostgreSQL streaming export
- Build your own UI with any chart library

**Architecture:**
```
Convex → Fivetran/Airbyte → PostgreSQL → Cube.js → Your UI
```

**Tradeoff:** Adds 15-60 second latency for data changes. Not truly real-time.

---

### Embedded BI Quick Reference

| Tool | Convex Direct? | Real-time | Embedding | Cost |
|------|----------------|-----------|-----------|------|
| **Metabase** | ❌ (needs SQL) | ❌ Polling | Iframe/SDK | OSS or $85/user/mo |
| **Superset** | ❌ (needs SQL) | ❌ Polling | Iframe | OSS only |
| **Cube.js** | ❌ (via warehouse) | ⚠️ Cached | API (build own UI) | OSS or usage-based |
| **Lightdash** | ❌ (dbt required) | ❌ | Iframe | OSS or $100+/mo |
| **Evidence.dev** | ❌ (static build) | ❌ | Static embed | Free |

---

## 5. Convex Real-Time Strategy

### Server-Side Filtering (Recommended)

**Why server-side:**
- Convex optimized for filtered queries
- Automatic caching of query results
- Only transfer matching records to client
- Security: row-level access control

**Pattern:**
```typescript
// convex/inventory.ts
export const filteredInventory = query({
  args: {
    category: v.optional(v.string()),
    store: v.optional(v.id("stores")),
    minPrice: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("inventory");
    
    if (args.category) {
      query = query.withIndex("by_category", q => 
        q.eq("category", args.category)
      );
    }
    
    // Apply additional filters...
    return query.take(args.limit ?? 1000);
  },
});
```

**Client subscription:**
```typescript
const inventory = useQuery(api.inventory.filteredInventory, {
  category: selectedCategory,
  store: selectedStore,
});
```

### Performance Optimizations

1. **Index everything you filter by:**
   ```typescript
   // schema.ts
   inventory: defineTable({
     category: v.string(),
     store: v.id("stores"),
     // ...
   })
     .index("by_category", ["category"])
     .index("by_store", ["store"])
     .index("by_category_store", ["category", "store"])
   ```

2. **Limit returned fields:**
   ```typescript
   // Only return what charts need
   return inventory.map(item => ({
     id: item._id,
     price: item.price,
     quantity: item.quantity,
   }));
   ```

3. **Pagination for large results:**
   ```typescript
   // Use cursor-based pagination
   const { page, continueCursor } = await query.paginate(opts);
   ```

4. **Debounce filter changes:**
   ```typescript
   const debouncedFilters = useDebouncedValue(filters, 200);
   const data = useQuery(api.inventory.filtered, debouncedFilters);
   ```

### When to Cache Client-Side

For filter combinations that don't change data (sorting, local aggregation):

```typescript
const rawData = useQuery(api.inventory.getAll);
const sortedData = useMemo(() => 
  [...rawData].sort((a, b) => a.price - b.price),
  [rawData]
);
```

---

## 6. Notification Architecture

### Convex-Native Approach (Recommended)

**Pattern: Scheduled Functions + Action Triggers**

```typescript
// convex/alerts.ts
export const checkPriceAlerts = internalMutation({
  handler: async (ctx) => {
    // Get all active alert rules
    const alerts = await ctx.db.query("alertRules").collect();
    
    for (const alert of alerts) {
      const matches = await ctx.db.query("inventory")
        .withIndex("by_product", q => q.eq("productId", alert.productId))
        .filter(q => q.lt(q.field("price"), alert.priceThreshold))
        .take(1);
      
      if (matches.length > 0) {
        // Trigger notification action
        await ctx.scheduler.runAfter(0, internal.notifications.send, {
          userId: alert.userId,
          message: `Price drop alert: ${matches[0].name}`,
        });
      }
    }
  },
});

// Schedule to run every 5 minutes
export const scheduleAlertCheck = cronJobs({
  checkAlerts: {
    cron: "*/5 * * * *",
    handler: internal.alerts.checkPriceAlerts,
  },
});
```

**Notification Delivery Options:**
- **Push notifications:** Via web-push or mobile push
- **Email:** Integrate with SendGrid/Resend via HTTP action
- **In-app:** Store notifications in Convex, show in UI
- **Webhook:** POST to external systems

### Real-Time In-App Alerts

```typescript
// User subscribes to their alerts
const myAlerts = useQuery(api.notifications.getUnread);

// Show toast on new alert
useEffect(() => {
  if (myAlerts?.length) {
    toast(myAlerts[0].message);
  }
}, [myAlerts]);
```

---

## 7. Recommended Architecture

### Stack

```
┌─────────────────────────────────────────────────────────┐
│                    CannaSignal Frontend                  │
├──────────────┬──────────────┬───────────────────────────┤
│   ECharts    │   Deck.gl    │        Tremor             │
│  (Canvas)    │   (WebGL)    │   (Summary KPIs only)     │
│  ─ Scatter   │  ─ Heatmaps  │   ─ KPI Cards             │
│  ─ Bar       │  ─ Clusters  │   ─ Sparklines            │
│  ─ Line      │  ─ Regions   │   ─ Simple bars           │
└──────┬───────┴──────┬───────┴───────────┬───────────────┘
       │              │                   │
       └──────────────┴───────────────────┘
                      │
              ┌───────▼───────┐
              │ Convex Client │
              │  useQuery()   │
              └───────┬───────┘
                      │ WebSocket
              ┌───────▼───────┐
              │    Convex     │
              │  ─ Queries    │
              │  ─ Indexes    │
              │  ─ Cron jobs  │
              │  ─ Actions    │
              └───────────────┘
```

### File Structure

```
src/
├── components/
│   ├── charts/
│   │   ├── EChartsWrapper.tsx      # Canvas-based charts
│   │   ├── InventoryChart.tsx      # Price/quantity over time
│   │   ├── CategoryBreakdown.tsx   # Pie/bar by category
│   │   └── PriceHeatmap.tsx        # Price distribution
│   ├── maps/
│   │   ├── DeckGLMap.tsx           # WebGL map wrapper
│   │   ├── DispensaryMap.tsx       # NYS dispensary locations
│   │   └── RegionHeatmap.tsx       # Inventory by region
│   ├── filters/
│   │   ├── FilterPanel.tsx         # Main filter UI
│   │   ├── CategoryFilter.tsx
│   │   ├── LocationFilter.tsx
│   │   └── DateRangeFilter.tsx
│   └── kpi/
│       └── SummaryCards.tsx        # Tremor KPI cards (SVG OK here)
├── hooks/
│   ├── useFilteredInventory.ts     # Debounced filter query
│   └── useNotifications.ts         # Alert subscription
convex/
├── inventory.ts                     # Filtered queries
├── alerts.ts                        # Alert rules & triggers
├── notifications.ts                 # Notification actions
└── crons.ts                         # Scheduled alert checks
```

---

## 8. Implementation Priorities

### Phase 1: Core Filtering (Week 1)

1. Set up Convex indexes for filter dimensions
2. Build `useFilteredInventory` hook with server-side filtering
3. Add debouncing to filter inputs
4. Implement basic ECharts wrapper

### Phase 2: Visualizations (Week 2)

1. Replace Tremor charts with ECharts for detail views
2. Keep Tremor for summary KPIs (small data)
3. Integrate Deck.gl for dispensary map
4. Add MapLibre base layer

### Phase 3: Notifications (Week 3)

1. Define alert rule schema
2. Implement Convex cron job for alert checking
3. Build in-app notification system
4. Optional: email/push integration

---

## 9. Performance Testing Checklist

Before launch, validate with production-scale data:

- [ ] 100K inventory records render in <500ms
- [ ] Filter changes reflect in <200ms (after debounce)
- [ ] Map heatmap updates smoothly on filter
- [ ] Mobile: charts render without jank
- [ ] Memory stays stable during filter sessions
- [ ] Convex query costs reasonable (check dashboard)

---

## 10. Alternatives Considered

| Approach | Why Rejected |
|----------|--------------|
| Metabase embedded | Can't connect to Convex directly; iframe UX |
| Superset embedded | Same issues + heavy infrastructure |
| Full Cube.js stack | Adds warehouse complexity for marginal gain |
| Stick with Tremor | SVG performance ceiling too low |
| D3 from scratch | Too much custom code for standard charts |
| Highcharts | Paid license, no significant advantage over ECharts |

---

## Summary

**For CannaSignal's use case:**

1. **ECharts** for all filterable chart views (Canvas rendering)
2. **Tremor** only for summary KPIs (low data volume OK with SVG)
3. **Deck.gl + MapLibre** for geo visualizations
4. **Convex server-side filtering** with proper indexes
5. **Convex scheduled functions** for alert notifications

This stack provides:
- Sub-200ms filter response times
- True real-time updates (no polling)
- Scales to 100K+ records
- Full control over UX
- No additional infrastructure costs
