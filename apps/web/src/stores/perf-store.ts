import { create } from 'zustand';

export interface PerfState {
  cpuUsage: number;
  memoryUsage: number;
  fileEvents: number;
}

export const usePerfStore = create<PerfState>(() => ({
  cpuUsage: 0,
  memoryUsage: 0,
  fileEvents: 0,
}));
