// Normalizes backend /ai/chat responses into one uniform AI session model.
// Supports BOTH the current backend shape
//   { message, response: { intent, parameters, plan, execution }, context: { history, role } }
// and the future envelope
//   { success, message, reasoning, toolsUsed, executionTime, planner, metadata, citations, data }.
//
// At no point does this surface tenantId, database ids, internal SQL, or Prisma internals.

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normStatus(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'failure' || s === 'failed' || s === 'error') return 'failure';
  if (s === 'skipped') return 'skipped';
  return 'success';
}

function detectFailure(error) {
  const message = String(error || '').toLowerCase();
  if (/permission denied/i.test(message)) return { code: 'permission_denied', label: 'Permission denied' };
  if (/tool not found/i.test(message)) return { code: 'tool_not_found', label: 'Tool unavailable' };
  if (/no academic|no data|not found|no records/i.test(message)) return { code: 'no_data', label: 'No academic data found' };
  return { code: 'tool_failed', label: 'Tool failed' };
}

function buildSession(input) {
  const {
    answerText = '',
    intent = null,
    parameters = {},
    reasoning = null,
    reasoningSynthetic = false,
    planSteps = [],
    executionResults = [],
    citations = [],
    data = {},
    role = null,
    executionTime = null,
  } = input;

  const plans = asArray(planSteps);
  const results = asArray(executionResults);
  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failure').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const toolCount = results.filter((r) => r.status !== 'skipped').length;
  const executionTimeMs =
    executionTime != null
      ? Number(executionTime)
      : results.reduce((sum, r) => sum + Number(r.durationMs || 0), 0);

  let friendlyError = null;
  if (!plans.length) {
    friendlyError = { code: 'no_plan', label: 'No academic tool matched the request' };
  } else if (failed > 0) {
    const firstFailure = results.find((r) => r.status === 'failure');
    friendlyError = detectFailure(firstFailure && firstFailure.error);
  }

  return {
    answerText: String(answerText || ''),
    intent,
    parameters,
    planSteps: plans,
    executionResults: results,
    succeeded,
    failed,
    skipped,
    toolCount,
    plannerStepCount: plans.length,
    executionTimeMs,
    timestamp: new Date().toISOString(),
    reasoning,
    reasoningSynthetic,
    citations: asArray(citations),
    data,
    role,
    friendlyError,
  };
}

function buildLegacy(raw) {
  const responseBlock = asObject(raw.response);
  const plan = asObject(responseBlock.plan);
  const execution = asObject(responseBlock.execution);
  const context = asObject(raw.context);

  const planSteps = asArray(plan.steps).map((s, i) => ({
    id: String(s.id ?? `step-${i + 1}`),
    tool: s.tool || s.toolId || '',
    input: s.input,
    dependsOn: asArray(s.dependsOn),
    mode: s.mode || 'sequential',
  }));

  const executionResults = asArray(execution.results).map((r) => ({
    stepId: String(r.stepId ?? r.id ?? ''),
    toolId: String(r.toolId ?? r.tool ?? ''),
    status: normStatus(r.status),
    durationMs: Number(r.durationMs ?? r.time ?? 0),
    error: r.error || null,
    output: r.output,
  }));

  return buildSession({
    answerText: raw.message,
    intent: responseBlock.intent,
    parameters: asObject(responseBlock.parameters),
    reasoning: plan.rationale || null,
    planSteps,
    executionResults,
    role: context.role || null,
  });
}

function normalizeEnvelope(raw) {
  const planner = asObject(raw.planner);
  const metadata = asObject(raw.metadata);

  const results = asArray(raw.toolsUsed).map((t, i) => ({
    stepId: String(t.stepId ?? t.id ?? `step-${i + 1}`),
    toolId: String(t.toolId ?? t.id ?? t.name ?? ''),
    status: normStatus(t.status),
    durationMs: Number(t.durationMs ?? t.time ?? 0),
    error: t.error || null,
    output: t.output ?? null,
  }));

  const planSteps = asArray(planner.steps).map((s, i) => ({
    id: String(s.id ?? s.stepId ?? `step-${i + 1}`),
    tool: s.tool ?? s.toolId ?? '',
    input: s.input,
    dependsOn: asArray(s.dependsOn),
    mode: s.mode || 'sequential',
  }));

  return buildSession({
    answerText: raw.message,
    plan: planner,
    intent: planner.intent ?? metadata.intent,
    parameters: asObject(planner.parameters ?? metadata.parameters),
    reasoning: raw.reasoning ?? planner.rationale ?? null,
    planSteps,
    executionResults: results,
    citations: asArray(raw.citations),
    data: asObject(raw.data),
    role: metadata.role || null,
    executionTime: raw.executionTime,
  });
}

export function normalizeAiResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return buildSession({ answerText: '' });
  }

  const isEnvelope =
    'toolsUsed' in raw || 'reasoning' in raw || ('planner' in raw && !('execution' in raw)) || 'executionTime' in raw;

  return isEnvelope ? normalizeEnvelope(raw) : buildLegacy(raw);
}

export default { normalizeAiResponse };