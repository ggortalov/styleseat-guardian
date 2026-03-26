import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SOUND_OPTIONS,
  SOUND_CATEGORIES,
  getSoundEnabled,
  setSoundEnabled,
  getSoundChoice,
  setSoundChoice,
  playConfirmation,
  previewSound,
} from './soundService';

describe('soundService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('SOUND_OPTIONS', () => {
    it('has 12 items', () => {
      expect(SOUND_OPTIONS).toHaveLength(12);
    });

    it('each item has name, category, and description', () => {
      SOUND_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty('name');
        expect(option).toHaveProperty('category');
        expect(option).toHaveProperty('description');
        expect(typeof option.name).toBe('string');
        expect(typeof option.category).toBe('string');
        expect(typeof option.description).toBe('string');
      });
    });
  });

  describe('SOUND_CATEGORIES', () => {
    it('has 4 items', () => {
      expect(SOUND_CATEGORIES).toHaveLength(4);
    });

    it('contains Nature, Instrument, Digital, Ambient', () => {
      expect(SOUND_CATEGORIES).toEqual(['Nature', 'Instrument', 'Digital', 'Ambient']);
    });
  });

  describe('getSoundEnabled / setSoundEnabled', () => {
    it('returns true by default when localStorage is empty', () => {
      expect(getSoundEnabled()).toBe(true);
    });

    it('round-trips setSoundEnabled(false) -> getSoundEnabled() === false', () => {
      setSoundEnabled(false);
      expect(getSoundEnabled()).toBe(false);
    });

    it('round-trips setSoundEnabled(true) -> getSoundEnabled() === true', () => {
      setSoundEnabled(false);
      setSoundEnabled(true);
      expect(getSoundEnabled()).toBe(true);
    });
  });

  describe('getSoundChoice / setSoundChoice', () => {
    it('returns Piano by default when localStorage is empty', () => {
      expect(getSoundChoice()).toBe('Piano');
    });

    it('round-trips setSoundChoice/getSoundChoice', () => {
      setSoundChoice('Piano');
      expect(getSoundChoice()).toBe('Piano');
    });

    it('round-trips with another value', () => {
      setSoundChoice('Gong');
      expect(getSoundChoice()).toBe('Gong');
    });
  });

  describe('playConfirmation', () => {
    it('does nothing when sound is disabled', () => {
      setSoundEnabled(false);
      const ctorSpy = vi.spyOn(globalThis, 'AudioContext');
      playConfirmation();
      expect(ctorSpy).not.toHaveBeenCalled();
    });

    it('creates AudioContext when sound is enabled', () => {
      setSoundEnabled(true);
      const ctorSpy = vi.spyOn(globalThis, 'AudioContext');
      playConfirmation();
      expect(ctorSpy).toHaveBeenCalled();
    });
  });

  describe('previewSound', () => {
    it('creates AudioContext regardless of enabled setting', () => {
      setSoundEnabled(false);
      const ctorSpy = vi.spyOn(globalThis, 'AudioContext');
      previewSound('Glass');
      expect(ctorSpy).toHaveBeenCalled();
    });

    it('falls back to Droplet for unknown sound name', () => {
      // Should not throw for an unknown name — falls back to Droplet generator
      expect(() => previewSound('NonExistentSound')).not.toThrow();
    });
  });
});
