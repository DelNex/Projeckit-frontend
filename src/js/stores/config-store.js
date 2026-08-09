import * as ApiClient from '../api/api-client.js';
import * as ConfigApi from '../api/config-api.js';

// Centralized Master Configuration Store (Tier 1 Source of Truth)
const CONFIG_STORAGE_KEY = 'deped_master_config_v2';
let currentConfig = null;

const defaultConfig = {
  // Minimal default UI config. Real data should come from the backend via API calls.
  faculty: {
    teacherName: '',
    designation: '',
    approverName: '',
  },
  academicPeriod: {
    schoolYear: '',
    term: '',
  },
  tracksAndStrands: [],
  sections: [],
  subjects: [],
  students: [],
  // Local user profile is optional and should contain only non-sensitive UI information (no tokens/passwords).
  userProfile: null,
};

const EMPTY_CONFIG = {
  faculty: { teacherName: '', designation: '', department: '', approverName: '' },
  academicPeriod: { schoolYear: '', term: '', quarter: '' },
  tracksAndStrands: [],
  sections: [],
  subjects: [],
  students: [],
  competencies: {},
  userProfile: null,
};

export const ConfigStore = {
  async initialize() {
    try {
      await ApiClient.fetchCsrfToken();
    } catch (e) {
      console.warn('[ConfigStore] CSRF token fetch failed during initialization', e);
    }

    try {
      const response = await ConfigApi.getConfig();
      if (response?.success && response.data) {
        currentConfig = response.data;
        this.saveLocal(response.data);
        return response.data;
      }

      // Backend returned no config data; clear any stale local cache and return null so callers know no authoritative config exists.
      console.warn('[ConfigStore] Backend returned no config data; clearing stale local config');
      this.clearLocal();
      currentConfig = null;
      return null;
    } catch (error) {
      // Do not fall back to a default development config. Surface the issue by returning null and logging the error.
      console.error('[ConfigStore] Failed to load configuration from backend', error);
      this.clearLocal();
      currentConfig = null;
      return null;
    }
  },

  get() {
    // Return currentConfig or null if none loaded. Do not invent a default config in production.
    return currentConfig || null;
  },

  // Null-safe accessor for views that render tables/picklists from config data.
  // Returns an empty-shaped config so views render empty states instead of crashing
  // when the backend has no authoritative config row yet.
  getSafe() {
    if (currentConfig) return currentConfig;
    return JSON.parse(JSON.stringify(EMPTY_CONFIG));
  },

  clearLocal() {
    // Clear stored config but preserve userProfile if present (avoid wiping authenticated UI state)
    let preservedProfile = null;
    try {
      const s = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        preservedProfile = parsed?.userProfile || null;
      }
    } catch (e) {
      // ignore parse errors
    }

    currentConfig = null;
    try {
      if (preservedProfile) {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ userProfile: preservedProfile }));
      } else {
        localStorage.removeItem(CONFIG_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[ConfigStore] Failed to clear local configuration cache', e);
    }
  },


  saveLocal(configData) {
    // Preserve UI-only userProfile when saving backend-sourced config that may not include it.
    const preservedProfile = (currentConfig && currentConfig.userProfile) || (function() {
      try {
        const s = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (!s) return null;
        const parsed = JSON.parse(s);
        return parsed?.userProfile || null;
      } catch (_) {
        return null;
      }
    })();

    const merged = Object.assign({}, configData || {}, { userProfile: (configData && configData.userProfile) ? configData.userProfile : preservedProfile });
    currentConfig = merged;
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('deped_config_updated', { detail: merged }));
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('deped_config_channel');
        channel.postMessage({ type: 'CONFIG_UPDATED', payload: merged });
        channel.close();
      }
    } catch (e) {
      console.error('[ConfigStore] Failed to save configuration to localStorage', e);
    }
  },

  async save(configData) {
    // Attempt persistence to the backend first. If the backend write fails,
    // degrade to a local-only save and surface a warning so the UI never
    // reports success while the change was lost.
    try {
      await this.saveRemote(configData);
    } catch (error) {
      console.warn('[ConfigStore] Backend save failed; keeping local-only copy', error);
      this.saveLocal(configData);
      try {
        window.dispatchEvent(new CustomEvent('deped_api_error', {
          detail: {
            status: 500,
            message: 'Could not reach the server. Your change was kept on this device only and may be lost if you sign out.',
          },
        }));
      } catch (_) {
        // ignore secondary failures
      }
      return false;
    }
    this.saveLocal(configData);
    return true;
  },

  async saveRemote(configData) {
    // Propagate any errors so callers can handle remote persistence failures explicitly.
    return await ConfigApi.saveConfig(configData);
  },

};
