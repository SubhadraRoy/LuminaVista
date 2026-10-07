/**
 * api/_lib/jev/jev-dag.js - Dynamic Tool Directed Acyclic Graph (DAG) Synthesizer
 * Generates structured execution graphs for single and multi-step autonomous tool pipelines.
 */

export function synthesizeToolDag(prompt = '', route = '', compoundPlan = [], entities = {}) {
  const p = String(prompt).toLowerCase();
  const nodes = [];
  let nextId = 1;

  function addNode(tool, action, params = {}, dependsOn = [], parallel = false, description = '') {
    const id = `step_${nextId++}_${tool.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const node = {
      id,
      tool,
      action,
      params,
      dependsOn,
      parallel,
      description
    };
    nodes.push(node);
    return id;
  }

  // A. Specialized Chaos Engineering Drill
  if (/\b(chaos\s*engineering|chaos\s*drill|flaky\s*upstream|mock\s*server.*8999)\b/i.test(p)) {
    const n1 = addNode('TOOL:SEARCH_WEB', 'search', { query: 'Docker Engine API list containers response schema' }, [], false, 'Discover Docker API response schema');
    const n2 = addNode('TOOL:WRITE_FILE', 'create', { filename: 'mock_docker.py', port: 8999, errorRate: 0.15 }, [n1], false, 'Generate mock Docker API with 15% error injection');
    const n3 = addNode('TOOL:WRITE_FILE', 'create', { filename: 'stress_test.py', requests: 1000, maxRetries: 2, logFile: 'chaos.log' }, [n2], false, 'Synthesize resilience stress tester');
    const n4 = addNode('TOOL:EXEC', 'execute', { command: 'nice -n 10 python stress_test.py' }, [n3], false, 'Run stress test under controlled priority');
    const n5 = addNode('TOOL:EXEC', 'archive', { command: 'mkdir -p /tmp/chaos_archive && gzip -c chaos.log > /tmp/chaos_archive/chaos.log.gz && rm chaos.log' }, [n4], false, 'Archive logs and clean temporary files');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Completed chaos engineering drill with resilience measurements' }, [n5], false, 'Finalize autonomous task');
    return { nodes, topologicalOrder: nodes.map(n => n.id), isDag: true };
  }

  // B. Specialized Systems Operations Workflow
  if (/\b(systems\s*automation|operations\s*agent|execution\s*workflow)\b/i.test(p)) {
    const n1 = addNode('TOOL:SEARCH_WEB', 'discovery', { query: 'System operational specs and runtime bindings' }, [], false, 'Discovery scan');
    const n2 = addNode('TOOL:LIST_DIR', 'audit', { path: '.' }, [n1], false, 'Audit workspace files');
    const n3 = addNode('TOOL:SCHEDULE_EVENT', 'query_calendar', { range: 'week' }, [n2], false, 'Check operational schedule');
    const n4 = addNode('TOOL:WRITE_FILE', 'create', { filename: 'ops_controller.py' }, [n3], false, 'Synthesize ops controller with checksums and port probing');
    const n5 = addNode('TOOL:EXEC', 'execute', { command: 'python ops_controller.py' }, [n4], false, 'Execute ops controller');
    const n6 = addNode('TOOL:SCHEDULE_EVENT', 'allocate_slot', { title: 'Operations Execution Window' }, [n5], false, 'Record operational calendar marker');
    const n7 = addNode('TOOL:WRITE_FILE', 'telemetry', { filename: 'ops_telemetry.json' }, [n6], false, 'Mount telemetry metadata');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Systems Automation & Operations workflow completed' }, [n7], false, 'Complete operations task');
    return { nodes, topologicalOrder: nodes.map(n => n.id), isDag: true };
  }

  // C. Compound Plans (e.g. SEARCH_WEB -> WRITE_FILE -> EXEC_COMMAND)
  if (Array.isArray(compoundPlan) && compoundPlan.length > 1) {
    let lastId = null;
    for (const stepRoute of compoundPlan) {
      const deps = lastId ? [lastId] : [];
      if (stepRoute === 'SEARCH_WEB') {
        lastId = addNode('TOOL:SEARCH_WEB', 'search', { query: prompt }, deps, false, 'Web research');
      } else if (stepRoute === 'WRITE_FILE') {
        const file = entities.files && entities.files[0] ? entities.files[0] : 'index.html';
        lastId = addNode('TOOL:WRITE_FILE', 'write', { filename: file }, deps, false, `Synthesize ${file}`);
      } else if (stepRoute === 'EDIT_FILE') {
        const file = entities.files && entities.files[0] ? entities.files[0] : 'app.js';
        lastId = addNode('TOOL:EDIT_FILE', 'edit', { filename: file }, deps, false, `Modify ${file}`);
      } else if (stepRoute === 'EXEC_COMMAND') {
        lastId = addNode('TOOL:EXEC', 'run', { command: 'npm test' }, deps, false, 'Execute verification command');
      }
    }
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: `Executed compound plan across ${compoundPlan.join(' -> ')}` }, lastId ? [lastId] : [], false, 'Pipeline complete');
    return { nodes, topologicalOrder: nodes.map(n => n.id), isDag: true };
  }

  // D. Single Direct Route Nodes
  if (route === 'SCHEDULE_CALENDAR') {
    const isRange = /\b(next\s*weeks?|this\s*week)\b/i.test(p);
    const n1 = addNode('TOOL:SCHEDULE_EVENT', 'view', { range: isRange ? 'next_week' : 'today', daysAhead: 7 }, [], false, 'Inspect calendar schedule');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Calendar schedule inspected' }, [n1], false, 'Task complete');
  } else if (route === 'WRITE_FILE') {
    const file = entities.files && entities.files[0] ? entities.files[0] : 'index.html';
    const n1 = addNode('TOOL:WRITE_FILE', 'create', { filename: file }, [], false, `Generate ${file}`);
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: `Synthesized ${file}` }, [n1], false, 'Task complete');
  } else if (route === 'EDIT_FILE') {
    const file = entities.files && entities.files[0] ? entities.files[0] : 'app.js';
    const n1 = addNode('TOOL:EDIT_FILE', 'modify', { filename: file }, [], false, `Patch ${file}`);
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: `Updated ${file}` }, [n1], false, 'Task complete');
  } else if (route === 'VIEW_FILE') {
    const file = entities.files && entities.files[0] ? entities.files[0] : '.';
    const n1 = addNode('TOOL:VIEW_FILE', 'inspect', { filename: file }, [], false, `Read ${file}`);
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: `Inspected ${file}` }, [n1], false, 'Task complete');
  } else if (route === 'DELETE_FILE') {
    const file = entities.files && entities.files[0] ? entities.files[0] : 'target';
    const n1 = addNode('TOOL:DELETE_FILE', 'remove', { filename: file }, [], false, `Delete ${file}`);
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: `Removed ${file}` }, [n1], false, 'Task complete');
  } else if (route === 'EXEC_COMMAND') {
    const n1 = addNode('TOOL:EXEC', 'run', { command: prompt }, [], false, 'Execute command');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Command executed' }, [n1], false, 'Task complete');
  } else if (route === 'SEARCH_WEB') {
    const n1 = addNode('TOOL:SEARCH_WEB', 'query', { query: prompt }, [], false, 'Query web search');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Web search completed' }, [n1], false, 'Task complete');
  } else if (route === 'LIST_DIR') {
    const n1 = addNode('TOOL:LIST_DIR', 'list', { path: '.' }, [], false, 'Audit workspace file tree');
    addNode('TOOL:TASK_COMPLETE', 'complete', { summary: 'Workspace audited' }, [n1], false, 'Task complete');
  }

  return {
    nodes,
    topologicalOrder: nodes.map(n => n.id),
    isDag: nodes.length > 0
  };
}
