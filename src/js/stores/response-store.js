import * as ResponseApi from '../api/response-api.js';

// Centralized Examinee Response Matrix Store (Exam Importer -> Item Analysis Pipeline Bridge)
const RESPONSE_STORAGE_KEY = 'deped_response_matrices_v2';
let cachedResponses = null;

export const ResponseStore = {
  async initialize() {
    // Load normalized response rows from the backend. Do not fall back to local mock data or local cache when the backend fails.
    const response = await ResponseApi.listResponses();
    if (response?.success && Array.isArray(response.data)) {
      const map = {};

      response.data.forEach((row) => {
        try {
          const parsed = typeof row.response === 'string' ? JSON.parse(row.response) : row.response;

          if (Array.isArray(parsed)) {
            map[row.sectionName] = map[row.sectionName] || {};
            map[row.sectionName][row.term] = parsed;
            return;
          }

          if (!parsed || typeof parsed !== 'object') return;

          map[row.sectionName] = map[row.sectionName] || {};
          map[row.sectionName][row.term] = map[row.sectionName][row.term] || [];

          const existingIndex = map[row.sectionName][row.term].findIndex(s => s.lrn === parsed.lrn);
          if (existingIndex >= 0) {
            map[row.sectionName][row.term][existingIndex] = parsed;
          } else {
            map[row.sectionName][row.term].push(parsed);
          }
        } catch (e) {
          // skip malformed rows
        }
      });

      cachedResponses = map;
      this.saveLocal(cachedResponses);
      return cachedResponses;
    }

    // If backend returned no data, return an empty dataset. Do not invent or return development fallback data.
    cachedResponses = {};
    return cachedResponses;
  },

  get() {
    if (cachedResponses !== null) {
      return cachedResponses;
    }

    try {
      const saved = localStorage.getItem(RESPONSE_STORAGE_KEY);
      cachedResponses = saved ? JSON.parse(saved) : {};
      return cachedResponses;
    } catch (e) {
      cachedResponses = {};
      return {};
    }
  },

  saveLocal(data) {
    try {
      cachedResponses = data;
      localStorage.setItem(RESPONSE_STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('deped_responses_updated', { detail: data }));
    } catch (e) {
      console.warn('[ResponseStore] Failed to save responses locally', e);
    }
  },

  async saveRemoteMatrix(sectionName, term, value) {
    // value is expected to be an array of student objects: [{ lrn, name, responses }, ...]
    if (!Array.isArray(value)) {
      throw new TypeError('Expected array of student response objects');
    }

    const rows = value.map(student => ({
       lrn: String(student.lrn || ''),
       sectionName,
       subjectId: student.subjectId || null,
       term,
       response: student
    }));

    // Propagate any errors to the caller so the UI can surface failures and not assume persistence succeeded.
    return await ResponseApi.bulkUpsertResponses(rows);
  },

  async deleteRemoteMatrix(sectionName, term) {
    // Propagate any errors so calling code can handle deletion failures explicitly.
    return await ResponseApi.deleteResponse(sectionName, term);
  },

  normalizeTermName(term) {
    if (term == null) return null;
    const normalized = String(term).trim().toLowerCase();
    const mapping = {
      'q1': 'First Quarter',
      'q2': 'Second Quarter',
      'q3': 'Third Quarter',
      'q4': 'Fourth Quarter',
      '1': 'First Quarter',
      '2': 'Second Quarter',
      '3': 'Third Quarter',
      '4': 'Fourth Quarter',
      'quarter 1': 'First Quarter',
      'quarter 2': 'Second Quarter',
      'quarter 3': 'Third Quarter',
      'quarter 4': 'Fourth Quarter',
      '1st quarter': 'First Quarter',
      '2nd quarter': 'Second Quarter',
      '3rd quarter': 'Third Quarter',
      '4th quarter': 'Fourth Quarter',
      'first quarter': 'First Quarter',
      'second quarter': 'Second Quarter',
      'third quarter': 'Third Quarter',
      'fourth quarter': 'Fourth Quarter'
    };
    return mapping[normalized] || term;
  },

  // Backwards-compat wrapper: keep the old method name while moving to 'term' everywhere
  normalizeQuarterName(term) {
    return this.normalizeTermName(term);
  },

  getForSection(sectionName, term = null) {
    const data = this.get();
    const sectionEntry = data[sectionName];
    if (!sectionEntry) return [];

    if (term == null) {
      if (Array.isArray(sectionEntry)) return sectionEntry;
      const termKeys = Object.keys(sectionEntry);
      return termKeys.length ? sectionEntry[termKeys[0]] : [];
    }

    if (Array.isArray(sectionEntry)) return sectionEntry;

    const normalizedTerm = this.normalizeTermName(term);
    return sectionEntry[normalizedTerm] || [];
  },

  getSectionMetrics(sectionName, term = null) {
    const responses = this.getForSection(sectionName, term);
    const totalStudents = Array.isArray(responses) ? responses.length : 0;
    const itemCount = totalStudents > 0 && Array.isArray(responses[0]?.responses) ? responses[0].responses.length : 0;
    const totalCorrect = Array.isArray(responses)
      ? responses.reduce((sum, student) => {
          if (!Array.isArray(student.responses)) return sum;
          return sum + student.responses.reduce((a, v) => a + (Number(v) || 0), 0);
        }, 0)
      : 0;

    const averageMps = totalStudents > 0 && itemCount > 0
      ? Number(((totalCorrect / (totalStudents * itemCount)) * 100).toFixed(1))
      : 0;

    return { responses, totalStudents, itemCount, totalCorrect, averageMps };
  },

  async saveSectionResponses(sectionName, responseArray, term) {
    if (term == null) throw new TypeError('Term is required when saving section responses');

    const data = this.get();
    const sectionEntry = data[sectionName];

    const normalizedTerm = this.normalizeTermName(term);

    data[sectionName] = Array.isArray(sectionEntry) ? {} : (sectionEntry || {});
    data[sectionName][normalizedTerm] = responseArray;

    this.saveLocal(data);
    // persist specific term and let errors propagate so the caller can surface failures
    await this.saveRemoteMatrix(sectionName, normalizedTerm, responseArray);
  }
};