import * as AdminApi from '../api/admin-api.js';
import { ConfigStore } from './config-store.js';

// School-wide App Settings (per-tenant). Mirrors backend AppSettingsData.
// DepEd defaults apply until an administrator saves school-specific values.
const DEFAULT_SETTINGS = {
  academicPeriod: {
    schoolYear: '2025–2026',
    term: 'First Quarter',
  },
  standards: {
    mpsPassing: 75,
    bands: [
      { label: 'Outstanding', min: 90 },
      { label: 'Very Satisfactory', min: 85 },
      { label: 'Satisfactory', min: 80 },
      { label: 'Fairly Satisfactory', min: 75 },
      { label: 'Did Not Meet Expectations', min: 0 },
    ],
  },
  school: {
    name: 'Capas Senior High School',
    address: 'Capas, Tarlac',
    schoolId: '',
  },
};

let cache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isAdminRole(role) {
  if (!role) return false;
  return String(role).trim().toLowerCase() === 'administrator';
}

export const AppSettingsStore = {
  async initialize() {
    const profile = ConfigStore.get()?.userProfile;
    if (!isAdminRole(profile?.role)) {
      cache = clone(DEFAULT_SETTINGS);
      return cache;
    }

    try {
      const response = await AdminApi.getAppSettings();
      if (response?.success && response.data) {
        cache = clone(response.data);
        return cache;
      }
    } catch (e) {
      // 403/offline: fall back to defaults silently (admin pages surface errors themselves)
    }

    cache = clone(DEFAULT_SETTINGS);
    return cache;
  },

  get() {
    return cache || clone(DEFAULT_SETTINGS);
  },

  async update(payload) {
    const response = await AdminApi.updateAppSettings(payload);
    if (response?.success && response.data) {
      cache = clone(response.data);
    }
    return response;
  },

  /** Highest band whose minimum percentage is met; falls back to the lowest band. */
  classificationTier(score, totalItems) {
    const settings = this.get();
    if (!totalItems || totalItems === 0) return 'Did Not Meet Expectations';
    const percentage = (Number(score) / Number(totalItems)) * 100;
    const bands = settings.standards.bands || [];
    const sorted = [...bands].sort((a, b) => b.min - a.min);
    const matched = sorted.find((b) => percentage >= b.min);
    return matched?.label || (sorted.length ? sorted[sorted.length - 1].label : 'Did Not Meet Expectations');
  },

  mpsPassing() {
    return Number(this.get().standards.mpsPassing) || 75;
  },
};
