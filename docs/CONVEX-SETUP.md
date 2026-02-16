# Convex Setup Guide for CannaSignal

## Prerequisites

- Node.js 18+
- npm or bun
- A Convex account (free tier works)

## Quick Start

### 1. Install Dependencies

```bash
cd /root/clawd/cannasignal
npm install convex
```

### 2. Login to Convex

```bash
npx convex login
```

This opens a browser to authenticate. After login, you'll get a deploy key.

### 3. Initialize Convex Project

```bash
npx convex dev --configure
```

Select "create a new project" and name it `cannasignal`.

This will:
- Create a `.env.local` file with `CONVEX_DEPLOYMENT`
- Generate types in `convex/_generated/`
- Start the dev server

### 4. Deploy Schema

```bash
npx convex push
```

This deploys the schema and all functions to Convex cloud.

### 5. Seed Initial Data

```bash
npx convex run retailers:seedNYSRetailers
npx convex run brands:seedPopularBrands
```

### 6. Get Your Deployment URL

After `convex push`, you'll see output like:
```
Deployed to https://YOUR_PROJECT.convex.cloud
```

This URL is needed for:
- Dashboard (`VITE_CONVEX_URL`)
- API Worker (`CONVEX_URL`)
- OpenClaw integration

## Environment Variables

### For Dashboard

Create `dashboard/.env.local`:
```
VITE_CONVEX_URL=https://YOUR_PROJECT.convex.cloud
```

### For Workers

Set via wrangler secrets:
```bash
cd workers/api
echo "https://YOUR_PROJECT.convex.cloud" | npx wrangler secret put CONVEX_URL
```

### For OpenClaw

Add to your environment or container config:
```
CONVEX_URL=https://YOUR_PROJECT.convex.cloud
CONVEX_DEPLOY_KEY=your-deploy-key
```

## Verify Setup

### Check Dashboard Connection

```bash
cd dashboard
npm run dev
```

Open http://localhost:5173 — should show real data instead of "Demo Mode"

### Test HTTP Routes

```bash
curl https://YOUR_PROJECT.convex.cloud/health
```

Should return: `{"status":"ok"}`

### Run a Query

```bash
npx convex run retailers:list
```

Should return the seeded NYS retailers.

## Project Structure

```
convex/
├── schema.ts         # Database schema (11 tables)
├── retailers.ts      # Retailer queries/mutations
├── brands.ts         # Brand queries/mutations
├── products.ts       # Product queries/mutations
├── inventory.ts      # Current inventory queries
├── analytics.ts      # Aggregated metrics
├── ingestion.ts      # Scraper data processing
├── http.ts           # HTTP routes for Workers
└── _generated/       # Auto-generated types
```

## Common Commands

| Command | Purpose |
|---------|---------|
| `npx convex dev` | Start dev server (watches for changes) |
| `npx convex push` | Deploy to production |
| `npx convex logs` | View function logs |
| `npx convex dashboard` | Open Convex dashboard |
| `npx convex run <function>` | Run a function manually |

## Troubleshooting

### "Module not found" errors
Run `npx convex dev` to regenerate types.

### Schema mismatch
Run `npx convex push --force` to force deploy.

### Auth issues
Run `npx convex logout` then `npx convex login` again.

## Next Steps

1. Deploy the API worker with `CONVEX_URL` secret
2. Update dashboard `.env.local` with Convex URL
3. Run initial scrape to populate data
4. Set up cron jobs for scheduled scraping
