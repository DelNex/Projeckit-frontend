import { AppSettingsStore } from '../app-settings-store.js';

describe('AppSettingsStore', () => {
  afterEach(() => {
    // Invalidates the cached module state for the next test
    jest.resetModules();
  });

  test('classifies scores using DepEd default bands', async () => {
    const store = (await import('../app-settings-store.js')).AppSettingsStore;
    await store.initialize();

    expect(store.classificationTier(18, 20)).toBe('Outstanding');
    expect(store.classificationTier(17, 20)).toBe('Very Satisfactory');
    expect(store.classificationTier(16, 20)).toBe('Satisfactory');
    expect(store.classificationTier(15, 20)).toBe('Fairly Satisfactory');
    expect(store.classificationTier(10, 20)).toBe('Did Not Meet Expectations');
    expect(store.classificationTier(0, 0)).toBe('Did Not Meet Expectations');
  });

  test('respects custom bands saved by an administrator', () => {
    AppSettingsStore.update = jest.fn();
    const settings = AppSettingsStore.get();
    settings.standards.bands = [
      { label: 'Mastered', min: 80 },
      { label: 'Developing', min: 0 },
    ];
    settings.standards.mpsPassing = 80;

    expect(AppSettingsStore.classificationTier(16, 20)).toBe('Mastered');
    expect(AppSettingsStore.classificationTier(10, 20)).toBe('Developing');
    expect(AppSettingsStore.mpsPassing()).toBe(80);
  });

  test('get() always returns a usable default when nothing is cached', () => {
    const settings = AppSettingsStore.get();
    expect(settings.academicPeriod.schoolYear).toBeDefined();
    expect(settings.standards.bands.length).toBeGreaterThan(0);
    expect(settings.school.name).toBeDefined();
  });
});