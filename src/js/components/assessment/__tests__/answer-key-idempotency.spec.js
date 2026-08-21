/**
 * @jest-environment jsdom
 */

import { renderSetupAnswerKey } from '../setup-answer-key.js';
import * as AssessmentApi from '../../../api/assessment-api.js';

jest.mock('../../../api/assessment-api.js');

describe('Answer Key Component — Idempotency & Single Event Binding', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('1. Binds save button handler only once despite multiple re-renders/refresh calls', async () => {
    AssessmentApi.upsertAnswerKey.mockResolvedValue({ success: true });

    const assessment = { id: 42, targetItems: 50 };
    renderSetupAnswerKey(null, [], container, assessment);

    const saveBtn = container.querySelector('#btn-save-answer-key');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn.dataset.bound).toBe('true');

    // Re-render multiple times (simulating bubble clicks or mode switches)
    renderSetupAnswerKey(null, [], container, assessment);
    renderSetupAnswerKey(null, [], container, assessment);

    // Trigger single click
    saveBtn.click();

    expect(AssessmentApi.upsertAnswerKey).toHaveBeenCalledTimes(1);
  });
});
