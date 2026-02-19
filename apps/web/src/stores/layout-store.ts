import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SidebarView =
  | 'explorer'
  | 'search'
  | 'git'
  | 'debug'
  | 'extensions'
  | 'titan-agent'
  | 'accounts'
  | 'settings'
  | '';

export type PanelView = 'terminal' | 'output' | 'problems' | 'debug-console';

export type LayoutPreset = 'default' | 'zen' | 'centered' | 'debug' | 'full-editor';

export interface LayoutState {
  // Sidebar
  sidebarVisible: boolean;
  sidebarView: SidebarView;
  sidebarWidth: number;

  // Right panel (AI chat / outline)
  rightPanelVisible: boolean;
  rightPanelWidth: number;

  // Bottom panel (terminal, output, problems)
  panelVisible: boolean;
  panelView: PanelView;
  panelHeight: number;

  // Zen / focused modes
  zenMode: boolean;
  centeredLayout: boolean;

  // Editor decorations
  minimapEnabled: boolean;
  breadcrumbsEnabled: boolean;
  stickyScrollEnabled: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;

  // Chrome visibility
  activityBarVisible: boolean;
  statusBarVisible: boolean;
  tabBarVisible: boolean;

  // Actions
  setSidebarVisible: (v: boolean) => void;
  setSidebarView: (view: SidebarView) => void;
  setSidebarWidth: (w: number) => void;
  toggleSidebar: () => void;
  toggleSidebarView: (view: SidebarView) => void;

  setRightPanelVisible: (v: boolean) => void;
  toggleRightPanel: () => void;

  setPanelVisible: (v: boolean) => void;
  setPanelView: (view: PanelView) => void;
  setPanelHeight: (h: number) => void;
  togglePanel: () => void;

  toggleZenMode: () => void;
  toggleCenteredLayout: () => void;

  toggleMinimap: () => void;
  toggleBreadcrumbs: () => void;
  toggleStickyScroll: () => void;
  toggleLineNumbers: () => void;
  toggleWordWrap: () => void;

  toggleActivityBar: () => void;
  toggleStatusBar: () => void;

  applyPreset: (preset: LayoutPreset) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      sidebarVisible: true,
      sidebarView: 'titan-agent',
      sidebarWidth: 320,

      rightPanelVisible: true,
      rightPanelWidth: 360,

      panelVisible: false,
      panelView: 'terminal',
      panelHeight: 240,

      zenMode: false,
      centeredLayout: false,

      minimapEnabled: true,
      breadcrumbsEnabled: true,
      stickyScrollEnabled: true,
      lineNumbersEnabled: true,
      wordWrapEnabled: true,

      activityBarVisible: true,
      statusBarVisible: true,
      tabBarVisible: true,

      setSidebarVisible: (v) => set({ sidebarVisible: v }),
      setSidebarView: (view) => set({ sidebarView: view }),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),

      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),

      toggleSidebarView: (view) =>
        set((s) => {
          if (s.sidebarView === view && s.sidebarVisible) {
            return { sidebarVisible: false };
          }
          return { sidebarView: view, sidebarVisible: true };
        }),

      setRightPanelVisible: (v) => set({ rightPanelVisible: v }),
      toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),

      setPanelVisible: (v) => set({ panelVisible: v }),
      setPanelView: (view) => set({ panelView: view, panelVisible: true }),
      setPanelHeight: (h) => set({ panelHeight: h }),
      togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),

      toggleZenMode: () =>
        set((s) => ({
          zenMode: !s.zenMode,
          sidebarVisible: s.zenMode ? true : false,
          rightPanelVisible: s.zenMode ? true : false,
          panelVisible: s.zenMode ? false : false,
          activityBarVisible: s.zenMode ? true : false,
          statusBarVisible: s.zenMode ? true : false,
          tabBarVisible: s.zenMode ? true : false,
        })),

      toggleCenteredLayout: () => set((s) => ({ centeredLayout: !s.centeredLayout })),

      toggleMinimap: () => set((s) => ({ minimapEnabled: !s.minimapEnabled })),
      toggleBreadcrumbs: () => set((s) => ({ breadcrumbsEnabled: !s.breadcrumbsEnabled })),
      toggleStickyScroll: () => set((s) => ({ stickyScrollEnabled: !s.stickyScrollEnabled })),
      toggleLineNumbers: () => set((s) => ({ lineNumbersEnabled: !s.lineNumbersEnabled })),
      toggleWordWrap: () => set((s) => ({ wordWrapEnabled: !s.wordWrapEnabled })),

      toggleActivityBar: () => set((s) => ({ activityBarVisible: !s.activityBarVisible })),
      toggleStatusBar: () => set((s) => ({ statusBarVisible: !s.statusBarVisible })),

      applyPreset: (preset) => {
        switch (preset) {
          case 'zen':
            set({
              zenMode: true,
              sidebarVisible: false,
              rightPanelVisible: false,
              panelVisible: false,
              activityBarVisible: false,
              statusBarVisible: false,
              tabBarVisible: false,
            });
            break;
          case 'debug':
            set({
              sidebarVisible: true,
              sidebarView: 'debug',
              panelVisible: true,
              panelView: 'debug-console',
              rightPanelVisible: false,
            });
            break;
          case 'full-editor':
            set({
              sidebarVisible: false,
              rightPanelVisible: false,
              panelVisible: false,
              activityBarVisible: false,
            });
            break;
          case 'default':
          default:
            set({
              zenMode: false,
              centeredLayout: false,
              sidebarVisible: true,
              sidebarView: 'titan-agent',
              rightPanelVisible: true,
              panelVisible: false,
              activityBarVisible: true,
              statusBarVisible: true,
              tabBarVisible: true,
            });
        }
      },
    }),
    {
      name: 'titan-layout',
      partialize: (s) => ({
        sidebarVisible: s.sidebarVisible,
        sidebarView: s.sidebarView,
        sidebarWidth: s.sidebarWidth,
        rightPanelVisible: s.rightPanelVisible,
        rightPanelWidth: s.rightPanelWidth,
        panelHeight: s.panelHeight,
        minimapEnabled: s.minimapEnabled,
        breadcrumbsEnabled: s.breadcrumbsEnabled,
        stickyScrollEnabled: s.stickyScrollEnabled,
        lineNumbersEnabled: s.lineNumbersEnabled,
        wordWrapEnabled: s.wordWrapEnabled,
        activityBarVisible: s.activityBarVisible,
        statusBarVisible: s.statusBarVisible,
      }),
    }
  )
);
