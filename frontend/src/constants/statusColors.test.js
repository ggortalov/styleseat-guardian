import { describe, it, expect } from 'vitest';
import { STATUS_COLORS, STATUS_ORDER, getStatusChartData } from './statusColors';

describe('statusColors', () => {
  describe('STATUS_COLORS', () => {
    it('has all 5 statuses', () => {
      expect(Object.keys(STATUS_COLORS)).toHaveLength(5);
      expect(STATUS_COLORS).toHaveProperty('Passed');
      expect(STATUS_COLORS).toHaveProperty('Failed');
      expect(STATUS_COLORS).toHaveProperty('Blocked');
      expect(STATUS_COLORS).toHaveProperty('Retest');
      expect(STATUS_COLORS).toHaveProperty('Untested');
    });

    it('values are hex color strings', () => {
      Object.values(STATUS_COLORS).forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('STATUS_ORDER', () => {
    it('contains exactly the 5 statuses in order', () => {
      expect(STATUS_ORDER).toEqual(['Passed', 'Failed', 'Blocked', 'Retest', 'Untested']);
    });

    it('matches STATUS_COLORS keys', () => {
      STATUS_ORDER.forEach((status) => {
        expect(STATUS_COLORS).toHaveProperty(status);
      });
    });
  });

  describe('getStatusChartData', () => {
    it('returns chart.js dataset from stats object', () => {
      const stats = { Passed: 10, Failed: 5, Blocked: 2, Retest: 1, Untested: 3 };
      const result = getStatusChartData(stats);

      expect(result.labels).toEqual(STATUS_ORDER);
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].data).toEqual([10, 5, 2, 1, 3]);
      expect(result.datasets[0].backgroundColor).toEqual(
        STATUS_ORDER.map((s) => STATUS_COLORS[s])
      );
      expect(result.datasets[0].borderWidth).toBe(0);
    });

    it('defaults missing stats to 0', () => {
      const stats = { Passed: 5 };
      const result = getStatusChartData(stats);
      expect(result.datasets[0].data).toEqual([5, 0, 0, 0, 0]);
    });

    it('handles empty stats', () => {
      const result = getStatusChartData({});
      expect(result.datasets[0].data).toEqual([0, 0, 0, 0, 0]);
    });
  });
});
