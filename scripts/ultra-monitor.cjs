// scripts/ultra-monitor.cjs - Continuous High-Frequency Website Availability & Telemetry Monitor
// Monitors LuminaVista production endpoints until 5:00 PM local time

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://lumina-vista-sigma.vercel.app';
const INTERVAL_SECONDS = 15; // 4 rounds per minute = ultra-frequency monitoring
const TIMEOUT_MS = 8000;

// Calculate target end time: 5:00 PM today (17:00:00 local time)
const now = new Date();
const targetEndTime = new Date(now);
targetEndTime.setHours(17, 0, 0, 0);

// If already past 5pm, set to tomorrow 5pm, but today it is ~10:42 AM
if (targetEndTime.getTime() <= now.getTime()) {
  targetEndTime.setDate(targetEndTime.getDate() + 1);
}

const ENDPOINTS = [
  {
    id: 'home',
    name: 'Home Portal',
    path: '/',
    method: 'GET',
    expectedStatuses: [200],
    validate: (body) => body.includes('<!DOCTYPE html>') || body.includes('Lumina')
  },
  {
    id: 'dashboard',
    name: 'Dashboard UI',
    path: '/dashboard.html',
    method: 'GET',
    expectedStatuses: [200, 302],
    validate: (body, status) => status === 200 || status === 302
  },
  {
    id: 'cal_status',
    name: 'Calendar Status API',
    path: '/api/calendar/status',
    method: 'GET',
    expectedStatuses: [200],
    validate: (body) => {
      try {
        const json = JSON.parse(body);
        return json && json.configured === true;
      } catch (e) { return false; }
    }
  },
  {
    id: 'cal_auth',
    name: 'Calendar Auth API',
    path: '/api/calendar/auth',
    method: 'GET',
    expectedStatuses: [200],
    validate: (body) => {
      try {
        const json = JSON.parse(body);
        return json && json.configured === true && !!json.authUrl;
      } catch (e) { return false; }
    }
  },
  {
    id: 'cal_sync',
    name: 'Calendar Sync Gateway',
    path: '/api/calendar/sync',
    method: 'GET',
    expectedStatuses: [200, 401],
    validate: (body, status) => {
      try {
        const json = JSON.parse(body);
        return !!json;
      } catch (e) { return false; }
    }
  },
  {
    id: 'iot_watchdog',
    name: 'IoT 24/7 Watchdog',
    path: '/api/iot?action=watchdog',
    method: 'GET',
    expectedStatuses: [200],
    validate: (body) => {
      try {
        const json = JSON.parse(body);
        return json && json.online === true;
      } catch (e) { return false; }
    }
  },
  {
    id: 'iot_time',
    name: 'IoT Hardware Time',
    path: '/api/iot?action=time',
    method: 'GET',
    expectedStatuses: [200],
    validate: (body) => {
      try {
        const json = JSON.parse(body);
        return json && (json.ok === true || !!json.serverTime || !!json.epoch) && !!json.signature;
      } catch (e) { return false; }
    }
  }
];

const logStreamPath = path.join(__dirname, '..', 'monitor-stream.log');
const statusJsonPath = path.join(__dirname, '..', 'monitor-status.json');
const incidentsLogPath = path.join(__dirname, '..', 'monitor-incidents.log');
const finalReportPath = path.join(__dirname, '..', 'monitor-final-report.json');

// Initialize logs
const startTime = new Date();
const initBanner = `================================================================================
LuminaVista Ultra-Frequency Availability Monitor Started
Target Host: ${BASE_URL}
Start Time: ${startTime.toLocaleString()} (Local)
Target End Time: ${targetEndTime.toLocaleString()} (Local - 5:00 PM)
Check Interval: Every ${INTERVAL_SECONDS} seconds
Monitored Endpoints: ${ENDPOINTS.length} critical paths
================================================================================\n`;

fs.writeFileSync(logStreamPath, initBanner, 'utf8');
if (!fs.existsSync(incidentsLogPath)) {
  fs.writeFileSync(incidentsLogPath, initBanner, 'utf8');
}

console.log(initBanner);

// State tracking
const stats = {
  startedAt: startTime.toISOString(),
  targetEndTime: targetEndTime.toISOString(),
  targetEndDesc: '5:00 PM Local Time',
  totalRounds: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  incidents: [],
  endpointStats: {}
};

for (const ep of ENDPOINTS) {
  stats.endpointStats[ep.id] = {
    name: ep.name,
    path: ep.path,
    checks: 0,
    passes: 0,
    fails: 0,
    lastStatus: null,
    lastLatencyMs: 0,
    minLatencyMs: Infinity,
    maxLatencyMs: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    consecutiveFails: 0
  };
}

async function probeEndpoint(ep) {
  const url = BASE_URL + ep.path;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: ep.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'LuminaVista-UltraMonitor/1.0 (+https://lumina-vista-sigma.vercel.app)'
      }
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - t0;
    const body = await res.text();
    const isStatusOk = ep.expectedStatuses.includes(res.status);
    const isBodyValid = ep.validate(body, res.status);
    const ok = isStatusOk && isBodyValid;

    return {
      id: ep.id,
      name: ep.name,
      ok,
      status: res.status,
      latency,
      bytes: body.length,
      error: ok ? null : (!isStatusOk ? `Unexpected status HTTP ${res.status}` : 'Body validation check failed')
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const latency = Date.now() - t0;
    return {
      id: ep.id,
      name: ep.name,
      ok: false,
      status: 0,
      latency,
      bytes: 0,
      error: err.name === 'AbortError' ? `Timeout (> ${TIMEOUT_MS}ms)` : err.message
    };
  }
}

async function runRound() {
  stats.totalRounds++;
  const roundTimestamp = new Date();
  const results = await Promise.all(ENDPOINTS.map(ep => probeEndpoint(ep)));

  let roundSuccesses = 0;
  let roundLatencies = [];
  const roundDetails = [];

  for (const r of results) {
    stats.totalRequests++;
    const s = stats.endpointStats[r.id];
    s.checks++;
    s.lastStatus = r.status;
    s.lastLatencyMs = r.latency;

    if (r.ok) {
      stats.successfulRequests++;
      s.passes++;
      s.consecutiveFails = 0;
      roundSuccesses++;
      roundLatencies.push(r.latency);

      if (r.latency < s.minLatencyMs) s.minLatencyMs = r.latency;
      if (r.latency > s.maxLatencyMs) s.maxLatencyMs = r.latency;
      s.totalLatencyMs += r.latency;
      s.avgLatencyMs = Math.round(s.totalLatencyMs / s.passes);
      roundDetails.push(`${r.id}:${r.latency}ms`);
    } else {
      stats.failedRequests++;
      s.fails++;
      s.consecutiveFails++;

      const incidentMsg = `[INCIDENT] ${roundTimestamp.toLocaleTimeString()} | ${r.name} (${r.id}) FAILED | HTTP ${r.status} | ${r.latency}ms | Error: ${r.error}`;
      fs.appendFileSync(incidentsLogPath, incidentMsg + '\n', 'utf8');
      console.warn(incidentMsg);

      stats.incidents.push({
        time: roundTimestamp.toISOString(),
        endpoint: r.name,
        status: r.status,
        latency: r.latency,
        error: r.error
      });
      roundDetails.push(`${r.id}:FAIL(${r.status})`);
    }
  }

  const roundAvgLatency = roundLatencies.length > 0 
    ? Math.round(roundLatencies.reduce((a, b) => a + b, 0) / roundLatencies.length) 
    : 0;

  const uptimePct = stats.totalRequests > 0 
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) 
    : '100.00';

  const msRemaining = Math.max(0, targetEndTime.getTime() - Date.now());
  const minutesRemaining = Math.round(msRemaining / 60000);
  const hoursPart = Math.floor(minutesRemaining / 60);
  const minsPart = minutesRemaining % 60;
  const timeRemainingStr = `${hoursPart}h ${minsPart}m`;

  const logLine = `[${roundTimestamp.toLocaleTimeString()}] Round #${stats.totalRounds} | ${roundSuccesses}/${ENDPOINTS.length} OK | Avg: ${roundAvgLatency}ms | Uptime: ${uptimePct}% | Remaining till 5 PM: ${timeRemainingStr} | [${roundDetails.join(', ')}]`;
  
  console.log(logLine);
  fs.appendFileSync(logStreamPath, logLine + '\n', 'utf8');

  // Update real-time status file (atomic JSON write)
  const currentSnapshot = {
    monitorRunning: true,
    lastUpdated: roundTimestamp.toISOString(),
    lastUpdatedDesc: roundTimestamp.toLocaleTimeString(),
    targetEndTime: targetEndTime.toISOString(),
    minutesRemaining,
    timeRemainingFormatted: timeRemainingStr,
    totalRounds: stats.totalRounds,
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    uptimePercentage: parseFloat(uptimePct),
    currentRoundAvgLatencyMs: roundAvgLatency,
    incidentCount: stats.incidents.length,
    endpoints: stats.endpointStats
  };

  try {
    fs.writeFileSync(statusJsonPath, JSON.stringify(currentSnapshot, null, 2), 'utf8');
  } catch (e) {}

  return msRemaining;
}

async function startLoop() {
  while (Date.now() < targetEndTime.getTime()) {
    const msRemaining = await runRound();
    if (msRemaining <= 0) break;

    // Wait interval or remaining time, whichever is smaller
    const sleepMs = Math.min(INTERVAL_SECONDS * 1000, msRemaining);
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  // 5:00 PM REACHED: Final Report Generation
  const finishTime = new Date();
  const finalSummary = `================================================================================
LUMINA VISTA ULTRA-FREQUENCY MONITOR COMPLETED (TARGET 5:00 PM REACHED)
Finish Time: ${finishTime.toLocaleString()}
Total Rounds Executed: ${stats.totalRounds}
Total Probes Dispatched: ${stats.totalRequests}
Successful Checks: ${stats.successfulRequests}
Failed Checks: ${stats.failedRequests}
Final Overall Uptime: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%
Total Incidents Logged: ${stats.incidents.length}
================================================================================`;

  console.log(finalSummary);
  fs.appendFileSync(logStreamPath, '\n' + finalSummary + '\n', 'utf8');

  stats.finishedAt = finishTime.toISOString();
  stats.finalUptimePct = parseFloat(((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2));
  stats.status = 'COMPLETED_TARGET_5PM';

  fs.writeFileSync(finalReportPath, JSON.stringify(stats, null, 2), 'utf8');
  fs.writeFileSync(statusJsonPath, JSON.stringify({ monitorRunning: false, completed: true, ...stats }, null, 2), 'utf8');

  process.exit(0);
}

// Graceful signal handling
process.on('SIGINT', () => {
  console.log('\n[MONITOR] Interrupt received. Saving final status snapshot...');
  stats.interruptedAt = new Date().toISOString();
  fs.writeFileSync(statusJsonPath, JSON.stringify({ monitorRunning: false, interrupted: true, ...stats }, null, 2), 'utf8');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[MONITOR] Termination received. Saving final status snapshot...');
  stats.terminatedAt = new Date().toISOString();
  fs.writeFileSync(statusJsonPath, JSON.stringify({ monitorRunning: false, terminated: true, ...stats }, null, 2), 'utf8');
  process.exit(0);
});

// Launch loop
startLoop().catch(err => {
  console.error('[FATAL MONITOR ERROR]', err);
  process.exit(1);
});
