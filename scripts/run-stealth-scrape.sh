#!/bin/bash
# Run Dutchie stealth scraper
# Usage: ./run-stealth-scrape.sh [URL1] [URL2] ...

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Default test URLs if none provided
if [ $# -eq 0 ]; then
    echo "Running with default test URLs..."
    npx tsx scripts/playwright-stealth-scraper.ts
else
    echo "Custom URL scraping not yet implemented in CLI"
    echo "Edit scripts/playwright-stealth-scraper.ts to add your URLs"
    exit 1
fi
