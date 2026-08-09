import * as ImportApi from '../api/import-api.js';

const IMPORT_LOG_KEY = 'deped_import_log_v1';
let cachedImports = null;

export const ImportStore = {
  async initialize() {
    // Import history is a local UI log. The authoritative roster is stored in
    // ConfigStore (and students are persisted via ConfigApi). Do not let the
    // backend roster overwrite this log, and never write import metadata into
    // config.students when saving.
    cachedImports = this.get();

    // Merge the durable backend copy (ImportLog table under the tenant config)
    // with the local log; the backend is authoritative for older entries.
    try {
      const response = await ImportApi.getImports(200);
      if (response?.success && Array.isArray(response.data) && response.data.length > 0) {
        const localByEntryId = new Map(cachedImports.map(e => [e.id, e]));
        const merged = [];
        const seen = new Set();
        for (const remote of response.data) {
          const entryId = remote.entryId || remote.id;
          if (seen.has(entryId)) continue;
          seen.add(entryId);
          const local = localByEntryId.get(entryId);
          merged.push({
            id: entryId,
            date: (local?.date) || (remote.createdAt ? String(remote.createdAt).replace('T', ' ').slice(0, 16) : ''),
            fileName: remote.fileName || '',
            section: remote.section || '',
            subject: remote.subject || '',
            status: remote.status || '',
            mps: remote.mps || null,
            studentCount: remote.studentCount ?? null,
            quarter: remote.term || '',
          });
        }
        // Local entries not yet synced to the backend stay on top
        for (const local of cachedImports) {
          const entryId = local.id;
          if (entryId && !seen.has(entryId)) {
            seen.add(entryId);
            merged.push(local);
          }
        }
        cachedImports = merged.slice(0, 200);
        this.saveLocal(cachedImports);
      }
    } catch (e) {
      console.warn('[ImportStore] Failed to merge import log from backend', e);
    }

    return cachedImports;
  },

  get() {
    if (cachedImports !== null) {
      return cachedImports;
    }

    try {
      const raw = localStorage.getItem(IMPORT_LOG_KEY);
      cachedImports = raw ? JSON.parse(raw) : [];
      return cachedImports;
    } catch (e) {
      cachedImports = [];
      return [];
    }
  },

  saveLocal(all) {
    try {
      cachedImports = all;
      localStorage.setItem(IMPORT_LOG_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('deped_imports_updated', { detail: all }));
    } catch (e) {
      console.warn('[ImportStore] Failed to save import log locally', e);
    }
  },

  save(all) {
    const trimmed = Array.isArray(all) ? all.slice(0, 200) : [];
    this.saveLocal(trimmed);
  },

  // Fire-and-forget: persist the entry in the backend ImportLog so the history
  // is durable across devices/reinstalls. Never blocks the UI flow.
  syncRemote(entry) {
    if (!entry || !entry.id) return;
    ImportApi.addImport({
      entryId: String(entry.id),
      fileName: entry.fileName || '',
      section: entry.section || '',
      subject: entry.subject || '',
      term: entry.quarter || entry.term || '',
      status: entry.status || '',
      mps: entry.mps != null ? String(entry.mps) : null,
      studentCount: entry.studentCount != null ? Number(entry.studentCount) : null,
      data: entry,
    }).catch(err => {
      console.warn('[ImportStore] Failed to sync import log entry to backend', err);
    });
  },

  add(entry) {
    const all = [entry, ...this.get()];
    const trimmed = all.slice(0, 200);
    this.save(trimmed);
    this.syncRemote(entry);
    return entry;
  },

  getRecent(limit = 10) {
    const all = this.get();
    return all.slice(0, limit);
  },
};