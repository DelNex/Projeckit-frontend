import { normalizeAiResponse } from './normalize.js';

describe('normalizeAiResponse (legacy /ai/chat shape)', () => {
  const legacyRaw = {
    message: 'Class 7-A shows 82.4% MPS.',
    response: {
      intent: 'class_mps',
      parameters: { section: '7-A' },
      plan: {
        rationale: 'Pick sectional analytics',
        steps: [
          { id: 's1', tool: 'section_analytics', input: { section: '7-A' }, dependsOn: [], mode: 'sequential' },
        ],
      },
      execution: {
        results: [
          { stepId: 's1', toolId: 'section_analytics', status: 'success', durationMs: 812, output: [{ year: 2026, mps: 82.4 }] },
        ],
      },
    },
    context: { id: 'tenant-1', role: 'teacher' },
  };

  it('extracts the sanitized role, not tenant ids', () => {
    const session = normalizeAiResponse(legacyRaw);
    expect(session.role).toBe('teacher');
    expect(JSON.stringify(session)).not.toContain('tenant-1');
  });

  it('builds plan steps and execution results from legacy block', () => {
    const session = normalizeAiResponse(legacyRaw);
    expect(session.planSteps).toHaveLength(1);
    expect(session.planSteps[0].tool).toBe('section_analytics');
    expect(session.executionResults).toHaveLength(1);
    expect(session.executionResults[0].status).toBe('success');
    expect(session.executionResults[0].toolId).toBe('section_analytics');
    expect(session.toolCount).toBe(1);
  });

  it('derives execution time from per-tool durations when absent', () => {
    const session = normalizeAiResponse(legacyRaw);
    expect(session.executionTimeMs).toBe(812);
  });

  it('uses executionTime when explicitly provided', () => {
    const withTime = { ...legacyRaw, executionTime: 2400 };
    const session = normalizeAiResponse(withTime);
    expect(session.executionTimeMs).toBe(2400);
  });

  it('keeps the answer text', () => {
    const session = normalizeAiResponse(legacyRaw);
    expect(session.answerText).toBe(legacyRaw.message);
    expect(session.answerText.length).toBeGreaterThan(0);
  });

  it('marks a no_plan friendly error when no steps matched', () => {
    const noPlan = { ...legacyRaw, response: { ...legacyRaw.response, plan: { steps: [] } } };
    const session = normalizeAiResponse(noPlan);
    expect(session.friendlyError).toEqual({ code: 'no_plan', label: 'No academic tool matched the request' });
  });

  it('detects permission failures', () => {
    const denied = {
      ...legacyRaw,
      response: {
        ...legacyRaw.response,
        execution: {
          results: [
            { stepId: 's1', toolId: 'x', status: 'failure', error: 'Permission denied: role cannot run tool' },
          ],
        },
      },
    };
    const session = normalizeAiResponse(denied);
    expect(session.friendlyError).toEqual({ code: 'permission_denied', label: 'Permission denied' });
  });
});

describe('normalizeAiResponse (future envelope)', () => {
  const envelopeRaw = {
    success: true,
    message: 'Here is the item analysis summary.',
    reasoning: 'Planner chose item_analysis for the requested metrics.',
    toolsUsed: [
      { id: 't1', toolId: 'item_analysis', status: 'success', durationMs: 620, output: [{ index: 0.42, difficulty: 'M' }] },
    ],
    executionTime: 620,
    planner: {
      intent: 'item_analysis',
      steps: [{ id: 'p1', tool: 'item_analysis', input: {}, dependsOn: [], mode: 'sequential' }],
      rationale: 'Best tool',
    },
    metadata: { role: 'principal', intent: 'item_analysis' },
    citations: ['Item analysis table'],
    data: { summary: 'ok' },
  };

  it('detects the envelope and maps toolsUsed', () => {
    const session = normalizeAiResponse(envelopeRaw);
    expect(session.executionResults).toHaveLength(1);
    expect(session.executionResults[0].toolId).toBe('item_analysis');
    expect(session.executionTimeMs).toBe(620);
  });

  it('maps planner steps, intent, reasoning, citations, data', () => {
    const session = normalizeAiResponse(envelopeRaw);
    expect(session.planSteps[0].tool).toBe('item_analysis');
    expect(session.intent).toBe('item_analysis');
    expect(session.reasoning).toBeTruthy();
    expect(session.citations).toEqual(['Item analysis table']);
    expect(session.data).toEqual({ summary: 'ok' });
  });

  it('surfaces the role from metadata only (no raw tenant ids)', () => {
    const session = normalizeAiResponse({ ...envelopeRaw, metadata: { role: 'principal', tenantId: 't-99' } });
    expect(session.role).toBe('principal');
    expect(JSON.stringify(session)).not.toContain('t-99');
  });

  it('normalizes failures in envelope tools', () => {
    const raw = {
      ...envelopeRaw,
      toolsUsed: [{ id: 't1', status: 'failure', error: 'Tool not found: missing tool' }],
    };
    const session = normalizeAiResponse(raw);
    expect(session.toolCount).toBe(1);
    expect(session.failed).toBe(1);
  });
});

describe('normalizeAiResponse (robustness)', () => {
  it('returns an empty session for null input', () => {
    const session = normalizeAiResponse(null);
    expect(session.answerText).toBe('');
    expect(session.planSteps).toEqual([]);
  });

  it('returns an empty session for non-objects', () => {
    const session = normalizeAiResponse('oops');
    expect(session.executionResults).toEqual([]);
  });
});