/**
 * CannaSignal Scraper Improvement Loop Worker
 * 
 * Runs every 6 hours to:
 * 1. Check data quality metrics from Convex
 * 2. Identify underperforming locations
 * 3. Log improvement opportunities
 * 4. Track progress over time
 * 
 * Future iterations can:
 * - Auto-tune scraper parameters
 * - Add new selectors based on failures
 * - Adjust cart hack priorities
 * - Enable/disable locations based on performance
 */

interface Env {
  CONVEX_URL: string;
  GITHUB_REPO: string;
  DISCORD_WEBHOOK_URL?: string;
}

interface QualityStats {
  timestamp: string;
  overall: {
    totalProducts: number;
    withQuantity: number;
    withWarning: number;
    qualityScore: number;
  };
  bySource: Record<string, number>;
  byRetailer: Array<{
    retailerId: string;
    total: number;
    withQuantity: number;
    score: number;
  }>;
}

interface ImprovementRecommendation {
  type: 'low_coverage' | 'missing_source' | 'stale_data' | 'new_platform';
  severity: 'high' | 'medium' | 'low';
  retailerId?: string;
  message: string;
  suggestedAction: string;
}

async function fetchQualityStats(convexUrl: string): Promise<QualityStats | null> {
  try {
    const response = await fetch(`${convexUrl}/quality/inventory`);
    if (!response.ok) {
      console.error(`Quality stats fetch failed: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Quality stats error:', error);
    return null;
  }
}

async function fetchRecentQuality(convexUrl: string, hours: number = 1): Promise<any> {
  try {
    const response = await fetch(`${convexUrl}/quality/recent?hours=${hours}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Recent quality error:', error);
    return null;
  }
}

function analyzeAndRecommend(stats: QualityStats): ImprovementRecommendation[] {
  const recommendations: ImprovementRecommendation[] = [];
  
  // Check overall quality
  if (stats.overall.qualityScore < 50) {
    recommendations.push({
      type: 'low_coverage',
      severity: 'high',
      message: `Overall data quality is ${stats.overall.qualityScore}% (target: 80%+)`,
      suggestedAction: 'Review scraper logs for failures, check selector validity',
    });
  } else if (stats.overall.qualityScore < 80) {
    recommendations.push({
      type: 'low_coverage',
      severity: 'medium',
      message: `Data quality at ${stats.overall.qualityScore}%, room for improvement`,
      suggestedAction: 'Focus on underperforming retailers',
    });
  }
  
  // Check quantity sources
  const unknownCount = stats.bySource['unknown'] || 0;
  const noneCount = stats.bySource['none'] || 0;
  const noSourceTotal = unknownCount + noneCount;
  
  if (noSourceTotal > stats.overall.totalProducts * 0.2) {
    recommendations.push({
      type: 'missing_source',
      severity: 'high',
      message: `${noSourceTotal} products (${Math.round(noSourceTotal / stats.overall.totalProducts * 100)}%) have no quantity source`,
      suggestedAction: 'Expand cart hack coverage or add new extraction patterns',
    });
  }
  
  // Check per-retailer performance
  for (const retailer of stats.byRetailer) {
    if (retailer.score < 30 && retailer.total > 10) {
      recommendations.push({
        type: 'low_coverage',
        severity: 'medium',
        retailerId: retailer.retailerId,
        message: `Retailer ${retailer.retailerId} has only ${retailer.score}% coverage (${retailer.withQuantity}/${retailer.total})`,
        suggestedAction: 'Check if retailer needs platform-specific scraper',
      });
    }
  }
  
  return recommendations;
}

async function sendDiscordReport(
  webhookUrl: string,
  stats: QualityStats,
  recommendations: ImprovementRecommendation[]
): Promise<void> {
  const embed = {
    title: '📊 Scraper Improvement Loop Report',
    color: stats.overall.qualityScore >= 80 ? 0x00ff00 : 
           stats.overall.qualityScore >= 50 ? 0xffaa00 : 0xff0000,
    fields: [
      {
        name: '📈 Overall Quality',
        value: `**${stats.overall.qualityScore}%** (${stats.overall.withQuantity}/${stats.overall.totalProducts} products)`,
        inline: true,
      },
      {
        name: '📦 Quantity Sources',
        value: Object.entries(stats.bySource)
          .map(([source, count]) => `${source}: ${count}`)
          .join('\n') || 'None',
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };
  
  if (recommendations.length > 0) {
    const highPriority = recommendations.filter(r => r.severity === 'high');
    if (highPriority.length > 0) {
      embed.fields.push({
        name: '🚨 High Priority Issues',
        value: highPriority.map(r => `• ${r.message}`).join('\n').slice(0, 1024),
        inline: false,
      });
    }
  }
  
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[ScrapeLoop] Starting improvement loop analysis...');
    
    // Fetch current quality stats
    const stats = await fetchQualityStats(env.CONVEX_URL);
    if (!stats) {
      console.error('[ScrapeLoop] Failed to fetch quality stats');
      return;
    }
    
    console.log(`[ScrapeLoop] Current quality: ${stats.overall.qualityScore}%`);
    console.log(`[ScrapeLoop] Products with quantity: ${stats.overall.withQuantity}/${stats.overall.totalProducts}`);
    console.log(`[ScrapeLoop] Sources:`, stats.bySource);
    
    // Analyze and generate recommendations
    const recommendations = analyzeAndRecommend(stats);
    
    if (recommendations.length > 0) {
      console.log(`[ScrapeLoop] ${recommendations.length} improvement recommendations:`);
      for (const rec of recommendations) {
        console.log(`  [${rec.severity.toUpperCase()}] ${rec.type}: ${rec.message}`);
        console.log(`    Action: ${rec.suggestedAction}`);
      }
    } else {
      console.log('[ScrapeLoop] No recommendations - quality is good!');
    }
    
    // Send Discord report if webhook configured
    if (env.DISCORD_WEBHOOK_URL) {
      await sendDiscordReport(env.DISCORD_WEBHOOK_URL, stats, recommendations);
      console.log('[ScrapeLoop] Discord report sent');
    }
    
    // Log completion
    console.log('[ScrapeLoop] Analysis complete');
  },
  
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'cannasignal-scraper-loop',
        version: '1.0.0',
        schedule: '0 */6 * * *',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (url.pathname === '/trigger' && request.method === 'POST') {
      // Manual trigger
      const stats = await fetchQualityStats(env.CONVEX_URL);
      if (!stats) {
        return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const recommendations = analyzeAndRecommend(stats);
      
      return new Response(JSON.stringify({
        triggered: true,
        timestamp: new Date().toISOString(),
        stats: stats.overall,
        bySource: stats.bySource,
        recommendations,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({
      service: 'cannasignal-scraper-loop',
      endpoints: [
        'GET /health - Service health',
        'POST /trigger - Manual analysis trigger',
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
