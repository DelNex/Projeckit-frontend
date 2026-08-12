import * as AssessmentApi from '../api/assessment-api.js';

let activeAssessmentId = null;
let currentAssessment = null;
let activeStage = 'setup'; // setup | exam-day | results
let activeSubTab = 'details'; // details | tos | answer-key | omr
let isLoading = false;
let lastError = null;
const listeners = new Set();

export const AssessmentStore = {
  getAssessmentIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id') || params.get('assessmentId');
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  },

  async load(id) {
    if (!id) {
      activeAssessmentId = null;
      currentAssessment = null;
      lastError = { status: 400, message: 'Invalid or missing Assessment ID.' };
      this.notify();
      return null;
    }

    activeAssessmentId = id;
    isLoading = true;
    lastError = null;
    this.notify();

    try {
      const response = await AssessmentApi.getAssessment(id);
      currentAssessment = response?.data || null;
      if (!currentAssessment) throw { status: 404, message: `Assessment #${id} not found.` };
      isLoading = false;
      this.notify();
      return currentAssessment;
    } catch (err) {
      console.error('[AssessmentStore] Load failed', err);
      currentAssessment = null;
      isLoading = false;
      lastError = err?.status ? err : { status: 500, message: err?.message || 'Failed to load assessment.' };
      this.notify();
      return null;
    }
  },

  get() { return currentAssessment; },
  getId() { return activeAssessmentId; },
  getStage() { return activeStage; },
  getSubTab() { return activeSubTab; },
  isLoading() { return isLoading; },
  getError() { return lastError; },

  setStage(stage) {
    activeStage = stage;
    this.notify();
  },

  setSubTab(subTab) {
    activeSubTab = subTab;
    this.notify();
  },

  subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  notify() {
    for (const cb of listeners) {
      try { cb({ assessment: currentAssessment, id: activeAssessmentId, stage: activeStage, subTab: activeSubTab, isLoading, error: lastError }); }
      catch (e) { console.error('[AssessmentStore] Listener error', e); }
    }
  },
};
