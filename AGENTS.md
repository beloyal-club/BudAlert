# BudAlert Agent Instructions

## Overview

**CannaSignal** — Cannabis dispensary inventory and price tracking for NYC.

## Architecture

```
Orchestrator (Breth)
    │
    ├── manages repo, reviews PRs
    │
    └── spawns coding agents:
        ├── Cloudflare Code Mode
        ├── Claude SDK
        └── Codex
```

## Development Workflow

### Rule: Orchestrator Does NOT Implement

Breth (orchestrator) coordinates but **never writes feature code directly**. Instead:

1. **Create task spec** in `/docs/tasks/`
2. **Spawn sub-agent** to implement on feature branch
3. **Review PR** when complete
4. **Merge or request changes**

### Branching Strategy

```
main (protected)
  └── feature/* (dev work)
  └── fix/* (bug fixes)
```

All work happens on branches. PRs required for main.

## Task Spec Template

Create in `/docs/tasks/TASK-XXX.md`:

```markdown
# TASK-XXX: [Title]

## Goal
[What should be achieved]

## Files to Modify
- `path/to/file.ts` — [what changes]

## Acceptance Criteria
- [ ] Tests pass
- [ ] Types check
- [ ] Feature works as described

## Context
[Links to relevant docs, prior work]
```

## Spawning Coding Agents

### For Cloudflare Workers (use Code Mode)

```javascript
// Via workers/codemode worker (if deployed)
// Or via Claude SDK with sandbox
```

### For Convex Functions

```bash
sessions_spawn({
  task: "Implement TASK-XXX. Read /root/BudAlert/docs/tasks/TASK-XXX.md, create branch feature/xxx, implement, test, push.",
  label: "coding-budalert-xxx"
})
```

### For Webapp (React/Vite)

```bash
sessions_spawn({
  task: "Implement TASK-XXX in webapp. cd /root/BudAlert/webapp, checkout feature/xxx, implement, test with npm run dev, push.",
  label: "coding-budalert-webapp-xxx"
})
```

## Project Structure

```
BudAlert/
├── convex/           # Convex backend (schema, functions)
├── dashboard/        # Admin dashboard
├── data/             # Retailer configs, scraped data
├── docs/             # Documentation
│   └── tasks/        # Task specs for coding agents
├── scripts/          # Utility scripts
├── webapp/           # React frontend (Vite + Tailwind)
└── workers/          # Cloudflare Workers
    ├── api/          # API endpoints
    ├── browser-rendering/  # CF Browser for scraping
    ├── cron/         # Scheduled tasks
    ├── lib/          # Shared utilities
    ├── scraper-loop/ # Main scraping loop
    └── scrapers/     # Platform-specific scrapers
```

## Key Services

| Service | URL | Purpose |
|---------|-----|---------|
| Convex | `quick-weasel-225.convex.cloud` | Backend DB + functions |
| Webapp | TBD | Consumer-facing product search |
| Workers | Cloudflare | Scraping + API |

## Current Status

See `CANNASIGNAL_PROGRESS.md` for detailed progress.

**Phase 5 Complete** — Smart features, coverage expansion, GraphQL inventory extraction.

## Pending Work

Check `scraper-fixes` branch for in-progress fixes.

## Commands

```bash
# Run scrapers locally
cd workers/scrapers && npx tsx dutchie.ts

# Deploy workers
cd workers/cron && npx wrangler deploy

# Run webapp
cd webapp && npm run dev

# Deploy Convex
npx convex deploy
```
