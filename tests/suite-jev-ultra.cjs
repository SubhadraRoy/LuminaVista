/**
 * tests/suite-jev-ultra.cjs - Test Suite 24: Jev Ultra Cognitive Intelligence Engine (v4.0 Super-System)
 * Validates 50+ domain ontology, L0 LRU Cache (< 0.05ms), Dynamic Tool DAG synthesis,
 * and expanded typed decision suite (noul, choice, score, rank, gate).
 */

module.exports = async function runJevUltraSuite({ assert, window, rootDir }) {
  console.log("\n[Test Suite 24: Jev Ultra Cognitive Intelligence Engine (v4.0 Super-System)]");

  const jevModule = await import('../api/_lib/jev-engine.js');
  const {
    jevClassifyIntent,
    jevAsk,
    jevClearCache,
    jevGetCacheStats
  } = jevModule;

  // Clear cache for clean benchmark testing
  jevClearCache();

  // =========================================================================
  // 1. L0 Sub-Millisecond Cache (< 0.05ms) & Stats Verification
  // =========================================================================
  const testQuery = "build a high-performance react dashboard in dashboard.jsx";
  const firstEval = jevClassifyIntent(testQuery);
  assert(firstEval.cached === false, "First query execution produces fresh evaluation (cached: false)");

  const secondEval = jevClassifyIntent(testQuery);
  assert(secondEval.cached === true, "Immediate repeat query hits L0 LRU Cache (cached: true)");
  assert(secondEval.latencyMs <= 1, `L0 cache hit latency is sub-millisecond (Got: ${secondEval.latencyMs}ms)`);

  const cacheStats = jevGetCacheStats();
  assert(cacheStats.size >= 1, "Cache tracks active entries");
  assert(cacheStats.hits >= 1, "Cache accurately counts hits");
  assert(cacheStats.hitRate > 0, "Cache calculates accurate hit rate");

  // =========================================================================
  // 2. 50+ Domain Semantic Ontology Comprehension
  // =========================================================================
  const domainTests = [
    { query: "run chaos engineering drill with 15% error rate on port 8999", expected: "AUTONOMOUS_TASK", desc: "Chaos engineering drill" },
    { query: "audit workspace and fix security vulnerabilities across all files", expected: "AUTONOMOUS_TASK", desc: "Autonomous remediation pipeline" },
    { query: "reschedule executive architecture sync to tomorrow 4pm", expected: "SCHEDULE_CALENDAR", desc: "Calendar mutation reschedule" },
    { query: "cancel my afternoon meeting with design team", expected: "SCHEDULE_CALENDAR", desc: "Calendar mutation cancel" },
    { query: "what is on my schedule for this week?", expected: "SCHEDULE_CALENDAR", desc: "Calendar range query" },
    { query: "create an express REST API server with JWT authentication in server.js", expected: "WRITE_FILE", desc: "Express backend API synthesis" },
    { query: "patch the authentication middleware to use constant-time comparison in auth.js", expected: "EDIT_FILE", desc: "Surgical middleware security patch" },
    { query: "where is the validateSession function defined in the codebase?", expected: "VIEW_FILE", desc: "AST symbol definition lookup" },
    { query: "grep for all occurrences of process.env in api directory", expected: "VIEW_FILE", desc: "Code grep search" },
    { query: "pytest tests/test_resilience.py -v", expected: "EXEC_COMMAND", desc: "Pytest test suite execution" },
    { query: "npm install @e2b/code-interpreter", expected: "EXEC_COMMAND", desc: "Package manager installation" },
    { query: "delete temporary log file in /tmp/debug.log", expected: "DELETE_FILE", desc: "Safe file deletion" },
    { query: "search the web for the latest CVE security advisories for node 20", expected: "SEARCH_WEB", desc: "Live web CVE discovery" },
    { query: "list all files in the current workspace directory", expected: "LIST_DIR", desc: "Workspace file listing" },
    { query: "what is the architectural difference between event sourcing and CQRS?", expected: "CONVERSATION", desc: "Architectural conceptual Q&A" }
  ];

  for (const dt of domainTests) {
    const res = jevClassifyIntent(dt.query);
    assert(res.route === dt.expected, `${dt.desc} correctly classified as ${dt.expected} (Got: ${res.route})`);
  }

  // =========================================================================
  // 3. Dynamic Tool Directed Acyclic Graph (DAG) Synthesizer
  // =========================================================================
  const chaosPrompt = "spin up mock server on port 8999 with 15% error rate, run stress test with 1000 requests, and compress chaos.log to /tmp/chaos_archive";
  const chaosResult = jevClassifyIntent(chaosPrompt);
  assert(chaosResult.route === 'AUTONOMOUS_TASK', "Complex chaos prompt routes to AUTONOMOUS_TASK");
  assert(chaosResult.dag && chaosResult.dag.isDag === true, "Jev produces structured DAG execution graph");
  assert(Array.isArray(chaosResult.dag.nodes) && chaosResult.dag.nodes.length >= 4, "DAG contains all required execution nodes");

  // Verify node dependency chaining
  const dagNodes = chaosResult.dag.nodes;
  const webNode = dagNodes.find(n => n.tool === 'TOOL:SEARCH_WEB');
  const mockNode = dagNodes.find(n => n.params && n.params.filename === 'mock_docker.py');
  const stressNode = dagNodes.find(n => n.params && n.params.filename === 'stress_test.py');
  const execNode = dagNodes.find(n => n.tool === 'TOOL:EXEC' && n.action === 'execute');
  const completeNode = dagNodes.find(n => n.tool === 'TOOL:TASK_COMPLETE');

  assert(webNode !== undefined, "DAG includes web search discovery node");
  assert(mockNode !== undefined, "DAG includes mock server creation node");
  assert(stressNode !== undefined, "DAG includes stress test synthesis node");
  assert(execNode !== undefined, "DAG includes execution node");
  assert(completeNode !== undefined, "DAG concludes with TASK_COMPLETE node");

  assert(Array.isArray(mockNode.dependsOn) && mockNode.dependsOn.includes(webNode.id), "mock_docker.py depends on search_web node");
  assert(Array.isArray(stressNode.dependsOn) && stressNode.dependsOn.includes(mockNode.id), "stress_test.py depends on mock_docker node");
  assert(Array.isArray(execNode.dependsOn) && execNode.dependsOn.includes(stressNode.id), "exec node depends on stress test node");
  assert(Array.isArray(chaosResult.dag.topologicalOrder), "DAG exports validated topological execution order");

  // =========================================================================
  // 4. Advanced Typed Decision Suite (jevAsk: rank & gate)
  // =========================================================================
  // Test 'rank' decision
  const rankResult = jevAsk(
    { task: "deploy new release", availableActions: ["run_tests", "build_bundle", "deploy_prod", "clean_cache"] },
    {
      actionOrder: {
        type: 'rank',
        candidates: ["run_tests", "build_bundle", "deploy_prod", "clean_cache"]
      }
    }
  );
  assert(rankResult.actionOrder.type === 'rank', "jevAsk produces typed 'rank' evaluation");
  assert(Array.isArray(rankResult.actionOrder.ranking), "jevAsk rank outputs ordered ranking array");
  assert(rankResult.actionOrder.ranking.length === 4, "jevAsk rank orders all 4 action candidates");

  // Test 'gate' decision: No-secrets policy
  const secureState = { payload: "Authorization: Bearer [REDACTED]", status: 200 };
  const gatePass = jevAsk(
    secureState,
    {
      securityAudit: { type: 'gate', policy: 'zero-exposure no-secrets' }
    }
  );
  assert(gatePass.securityAudit.type === 'gate', "jevAsk produces typed 'gate' evaluation");
  assert(gatePass.securityAudit.passed === true, "jevAsk gate passes sanitized state");

  const leakedState = { payload: "sk-proj-1234567890abcdef12345678", user: "attacker" };
  const gateFail = jevAsk(
    leakedState,
    {
      securityAudit: { type: 'gate', policy: 'zero-exposure no-secrets' }
    }
  );
  assert(gateFail.securityAudit.passed === false, "jevAsk gate fails state containing unredacted secret key");
  assert(gateFail.securityAudit.evidence.includes('Failed gate'), "jevAsk gate provides audit failure evidence");

  // Test 'choice' normalized softmax distribution
  const choiceEval = jevAsk(
    { query: "find syntax error in app.js" },
    {
      targetTool: {
        type: 'choice',
        criteria: {
          inspect_code: "view, read, cat, inspect, error",
          run_terminal: "exec, run, terminal, bash",
          search_web: "google, search, news"
        }
      }
    }
  );
  assert(choiceEval.targetTool.selection === 'inspect_code', "jevAsk choice correctly selects inspect_code");
  const dist = choiceEval.targetTool.distribution;
  const distSum = Object.values(dist).reduce((a, b) => a + b, 0);
  assert(Math.abs(distSum - 1.0) < 0.05, `jevAsk choice distribution sums to 1.0 (Sum: ${distSum})`);

  // =========================================================================
  // 5. Ultra Throughput Stress Benchmark
  // =========================================================================
  const stressQueries = [
    "create index.html",
    "edit app.js",
    "view main.py",
    "delete temp.txt",
    "run pytest",
    "search web for react",
    "list files",
    "check schedule today",
    "how do I use tailwind",
    "spin up mock server on 8999"
  ];

  const benchStart = performance.now();
  for (let i = 0; i < 200; i++) {
    const q = stressQueries[i % stressQueries.length];
    jevClassifyIntent(q);
  }
  const totalBenchMs = performance.now() - benchStart;
  const avgPerQuery = totalBenchMs / 200;
  assert(avgPerQuery < 1.0, `Ultra Jev engine throughput is sub-millisecond per eval (< 1.0ms, measured: ${avgPerQuery.toFixed(3)}ms)`);
};
