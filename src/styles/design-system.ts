// ══════════════════════════════════════════════
// GLOBAL DESIGN SYSTEM: BENTO-NOIR PRECISION
// ══════════════════════════════════════════════
// Swiss luxury watch crossed with hacker's terminal
// Obsessively clean, mathematically precise, electrically alive

// ───────────────────────────────────────────────
// TYPOGRAPHY CONFIGURATION
// ───────────────────────────────────────────────

export const typography = {
  fonts: {
    display: 'Syne, system-ui, sans-serif',
    body: 'DM Sans, system-ui, sans-serif',
    mono: 'Geist Mono, monospace',
  },
  scale: {
    '2xs': '0.625rem',   // 10px — timestamps, metadata
    xs:    '0.75rem',    // 12px — badges, chips, tiny labels
    sm:    '0.8125rem',  // 13px — secondary text
    base:  '0.9375rem',  // 15px — body default
    md:    '1.0625rem',  // 17px — emphasized body
    lg:    '1.25rem',    // 20px — card titles
    xl:    '1.5rem',     // 24px — section titles
    '2xl': '2rem',       // 32px — page headers
    '3xl': '3rem',       // 48px — hero numbers
    '4xl': '4rem',       // 64px — massive display
  },
  weights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ───────────────────────────────────────────────
// COLOR SYSTEM
// ───────────────────────────────────────────────

export const colors = {
  // Dark Base (primary surfaces)
void:       '#080A0C',   // deepest background (cool tint)
  base:       '#0E1117',   // main app background
  surface:    '#141922',   // cards, panels
  surfaceHover: '#1C2330', // hover states for surfaces
  elevated:   '#1C2330',   // inputs, nested cards
  overlay:    '#242F3E',   // dropdowns, tooltips, popovers
  border:     '#2A3549',   // subtle borders
  borderHi:   '#3D4F69',   // highlighted borders (focus, hover)
  
  // Brand Accent — Champagne Gold
  gold:       '#D4A853',   // primary brand accent
  goldLight:  '#E8C97A',   // hover state
  goldDark:   '#A8832E',   // pressed state
  goldGlow:   'rgba(212,168,83,0.15)',  // glow effects
  goldDim:    'rgba(212,168,83,0.08)',  // subtle fills
  
  // Semantic Colors
  safe:       '#22C55E',   // success, verified, safe
  safeDim:    'rgba(34,197,94,0.12)',
  safeGlow:   'rgba(34,197,94,0.2)',
  
  danger:     '#EF4444',   // error, threat, delete
  dangerDim:  'rgba(239,68,68,0.12)',
  dangerGlow: 'rgba(239,68,68,0.2)',
  
  warn:       '#F59E0B',   // warning, caution
  warnDim:    'rgba(245,158,11,0.12)',
  
  info:       '#38BDF8',   // informational
  infoDim:    'rgba(56,189,248,0.1)',
  
  active:     '#A78BFA',   // active/running process
  activeDim:  'rgba(167,139,250,0.12)',
  
// Text
  textPrimary:   '#F1F5F9',  // primary content
  textSecondary: '#94A3B8',  // secondary, labels
  textMuted:     '#4B5563',  // disabled, placeholders
  textGold:      '#D4A853',  // brand text, links, accents
  textInverse:   '#080A0C',  // text on light/gold backgrounds
  
  // Dashboard-specific
  goldSpark:   'rgba(212,168,83,0.6)',  // sparkline bars
  goldGlowDim: 'rgba(212,168,83,0.05)', // subtle glow
} as const;

// ───────────────────────────────────────────────
// SPACING SYSTEM (4px base)
// ───────────────────────────────────────────────

export const spacing = {
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  7:  '28px',
  8:  '32px',
  9:  '36px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

// ───────────────────────────────────────────────
// BORDER RADIUS
// ───────────────────────────────────────────────

export const radius = {
  xs:    '4px',   // inline badges, tiny elements
  sm:    '8px',   // buttons, inputs, chips
  md:    '12px',  // cards, panels, modals
  lg:    '16px',  // large cards, sheets
  xl:    '24px',  // hero panels, floating elements
  full:  '9999px',// pills, circles
} as const;

// ───────────────────────────────────────────────
// SHADOWS
// ───────────────────────────────────────────────

export const shadows = {
  sm:   '0 1px 2px rgba(0,0,0,0.4)',
  md:   '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
  lg:   '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
  gold: '0 0 0 1px rgba(212,168,83,0.3), 0 0 20px rgba(212,168,83,0.1)',
  safe: '0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.1)',
  danger: '0 0 0 1px rgba(239,68,68,0.3), 0 0 16px rgba(239,68,68,0.1)',
  float: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
} as const;

// ───────────────────────────────────────────────
// ANIMATIONS
// ───────────────────────────────────────────────

export const animations = {
  // Easing: expo-out for snappy, premium feel
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  
  // Durations
  instant: '80ms',
  fast:    '150ms',
  normal:  '250ms',
  slow:    '400ms',
  xslow:   '600ms',
  
  // Named animations
  fadeUp:     'fadeUp 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  fadeIn:     'fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  slideRight: 'slideRight 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  scaleIn:    'scaleIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  pulse:      'pulse 2s cubic-bezier(0.16, 1, 0.3, 1) infinite',
  shimmer:    'shimmer 1.5s cubic-bezier(0.16, 1, 0.3, 1) infinite',
  goldFlash:  'goldFlash 300ms cubic-bezier(0.16, 1, 0.3, 1) out',
  dangerFlash:'dangerFlash 300ms cubic-bezier(0.16, 1, 0.3, 1) out',
} as const;

// ───────────────────────────────────────────────
// SCROLLBAR STYLING
// ───────────────────────────────────────────────

export const scrollbar = {
  width: '4px',
  track: 'transparent',
  thumb: colors.border,
  thumbHover: colors.borderHi
};

// ───────────────────────────────────────────────
// COMPONENT LIBRARY SPECIFICATIONS
// ───────────────────────────────────────────────

// ═══════════════════════════════════════════════
// BUTTON COMPONENT
// ═══════════════════════════════════════════════

export const button = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.weights.semibold,
    lineHeight: '1.2',
    cursor: 'pointer',
    border: 'none',
    outline: 'none',
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
fontFamily: typography.fonts.body,
  },
  
  sizes: {
    sm: {
      padding: '6px 12px',
      fontSize: typography.scale.xs,
      borderRadius: radius.sm,
    },
    md: {
      padding: '10px 20px',
      fontSize: typography.scale.sm,
      borderRadius: radius.sm,
    },
    lg: {
      padding: '14px 28px',
      fontSize: typography.scale.md,
      borderRadius: radius.md,
    },
    xl: {
      padding: '18px 36px',
      fontSize: typography.scale.lg,
      borderRadius: radius.md,
    },
  },
  
  variants: {
    primary: {
      backgroundColor: colors.gold,
      color: colors.textInverse,
      boxShadow: shadows.gold,
      '&:hover': {
        backgroundColor: colors.goldLight,
        transform: 'translateY(-1px)',
        boxShadow: '0 4px 20px rgba(212,168,83,0.3)',
      },
      '&:active': {
        backgroundColor: colors.goldDark,
        transform: 'translateY(0)',
      },
    },
    
    secondary: {
      backgroundColor: 'transparent',
      color: colors.gold,
      border: `1px solid ${colors.border}`,
      '&:hover': {
        backgroundColor: colors.goldDim,
        borderColor: colors.gold,
      },
      '&:active': {
        backgroundColor: colors.goldDark,
      },
    },
    
    ghost: {
      backgroundColor: 'transparent',
      color: colors.textSecondary,
      '&:hover': {
        color: colors.textPrimary,
        backgroundColor: colors.border,
      },
      '&:active': {
        backgroundColor: colors.borderHi,
      },
    },
    
    danger: {
      backgroundColor: colors.danger,
      color: colors.textInverse,
      boxShadow: shadows.danger,
      '&:hover': {
        backgroundColor: '#DC2626',
        transform: 'translateY(-1px)',
        boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
      },
      '&:active': {
        backgroundColor: '#B91C1C',
        transform: 'translateY(0)',
      },
    },
    
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      transform: 'none !important',
      boxShadow: 'none !important',
    },
  },
  
  iconOnly: {
    width: '40px',
    height: '40px',
    padding: 0,
    borderRadius: radius.sm,
  },
  
  withIcon: {
    gap: spacing[2],
  },
} as const;

// ═══════════════════════════════════════════════
// CARD COMPONENT
// ═══════════════════════════════════════════════

export const card = {
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.md,
    overflow: 'hidden',
  },
  
  variants: {
    default: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    
    elevated: {
      backgroundColor: colors.elevated,
      borderColor: colors.borderHi,
    },
    
    interactive: {
      cursor: 'pointer',
      transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: shadows.lg,
        borderColor: colors.gold,
      },
    },
    
    statusRunning: {
      borderColor: 'rgba(34,197,94,0.4)',
      background: `linear-gradient(135deg, ${colors.surface}, rgba(34,197,94,0.04))`,
    },
    
    statusPaused: {
      borderColor: 'rgba(245,158,11,0.4)',
      background: `linear-gradient(135deg, ${colors.surface}, rgba(245,158,11,0.04))`,
    },
    
    statusOffline: {
      borderColor: 'rgba(148,163,184,0.3)',
      background: `linear-gradient(135deg, ${colors.surface}, rgba(148,163,184,0.04))`,
    },
  },
  
  header: {
    padding: spacing[4],
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  body: {
    padding: spacing[4],
  },
  
  footer: {
    padding: spacing[4],
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[2],
  },
} as const;

// ═══════════════════════════════════════════════
// BADGE COMPONENT
// ═══════════════════════════════════════════════

export const badge = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.weights.semibold,
    fontSize: typography.scale.xs,
    padding: '2px 8px',
    borderRadius: radius.full,
    lineHeight: 1,
  },
  
  variants: {
    completed: {
      backgroundColor: colors.safeDim,
      color: colors.safe,
      border: `1px solid ${colors.safe}`,
    },
    
    running: {
      backgroundColor: colors.activeDim,
      color: colors.active,
      border: `1px solid ${colors.active}`,
    },
    
    failed: {
      backgroundColor: colors.dangerDim,
      color: colors.danger,
      border: `1px solid ${colors.danger}`,
    },
    
    warning: {
      backgroundColor: colors.warnDim,
      color: colors.warn,
      border: `1px solid ${colors.warn}`,
    },
    
    info: {
      backgroundColor: colors.infoDim,
      color: colors.info,
      border: `1px solid ${colors.info}`,
    },
    
    gold: {
      backgroundColor: colors.goldDim,
      color: colors.gold,
      border: `1px solid ${colors.gold}`,
    },
    
    muted: {
      backgroundColor: colors.border,
      color: colors.textMuted,
    },
  },
  
  sizes: {
    sm: {
      padding: '1px 6px',
      fontSize: typography.scale['2xs'],
    },
    md: {
      padding: '2px 8px',
      fontSize: typography.scale.xs,
    },
    lg: {
      padding: '3px 10px',
      fontSize: typography.scale.sm,
    },
  },
} as const;

// ═══════════════════════════════════════════════
// INPUT COMPONENT
// ═══════════════════════════════════════════════

export const input = {
  base: {
    width: '100%',
    padding: '10px 14px',
    fontSize: typography.scale.base,
    fontFamily: typography.fonts.body,
    color: colors.textPrimary,
    backgroundColor: colors.base,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    outline: 'none',
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    '&:focus': {
      borderColor: colors.gold,
      boxShadow: shadows.gold,
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  
  variants: {
    default: {
      backgroundColor: colors.base,
    },
    
    elevated: {
      backgroundColor: colors.elevated,
      '&:focus': {
        backgroundColor: colors.base,
      },
    },
    
    ghost: {
      backgroundColor: 'transparent',
      border: 'none',
      padding: '8px 4px',
      '&:focus': {
        backgroundColor: colors.base,
        boxShadow: 'none',
      },
    },
  },
  
  sizes: {
    sm: {
      padding: '8px 12px',
      fontSize: typography.scale.xs,
    },
    md: {
      padding: '10px 14px',
      fontSize: typography.scale.base,
    },
    lg: {
      padding: '14px 18px',
      fontSize: typography.scale.md,
    },
  },
} as const;

// ═══════════════════════════════════════════════
// TAB COMPONENT
// ═══════════════════════════════════════════════

export const tab = {
  base: {
    padding: '8px 16px',
    fontSize: typography.scale.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    '&:hover': {
      backgroundColor: colors.border,
      color: colors.textPrimary,
    },
  },
  
  variants: {
    ghost: {
      '&.active': {
        backgroundColor: colors.goldDim,
        color: colors.gold,
        fontWeight: typography.weights.semibold,
      },
    },
    
    pill: {
      borderRadius: radius.full,
      '&.active': {
        backgroundColor: colors.gold,
        color: colors.textInverse,
        boxShadow: shadows.gold,
      },
    },
    
    underline: {
      borderBottom: `2px solid transparent`,
      '&.active': {
        borderBottomColor: colors.gold,
        color: colors.textPrimary,
      },
    },
  },
  
  sizes: {
    sm: {
      padding: '6px 12px',
      fontSize: typography.scale.xs,
    },
    md: {
      padding: '8px 16px',
      fontSize: typography.scale.sm,
    },
    lg: {
      padding: '10px 20px',
      fontSize: typography.scale.md,
    },
  },
} as const;

// ═══════════════════════════════════════════════
// AVATAR COMPONENT
// ═══════════════════════════════════════════════

export const avatar = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    fontWeight: typography.weights.semibold,
    flexShrink: 0,
  },
  
  sizes: {
    xs: {
      width: '24px',
      height: '24px',
      fontSize: typography.scale['2xs'],
    },
    sm: {
      width: '32px',
      height: '32px',
      fontSize: typography.scale.xs,
    },
    md: {
      width: '40px',
      height: '40px',
      fontSize: typography.scale.sm,
    },
    lg: {
      width: '48px',
      height: '48px',
      fontSize: typography.scale.md,
    },
    xl: {
      width: '64px',
      height: '64px',
      fontSize: typography.scale.lg,
    },
  },
  
  variants: {
    default: {
      backgroundColor: colors.border,
      color: colors.textMuted,
    },
    
    brand: {
      backgroundColor: colors.gold,
      color: colors.textInverse,
    },
    
    safe: {
      backgroundColor: colors.safe,
      color: colors.textInverse,
    },
    
    danger: {
      backgroundColor: colors.danger,
      color: colors.textInverse,
    },
    
    active: {
      backgroundColor: colors.active,
      color: colors.textInverse,
    },
  },
  
  withStatus: {
    position: 'relative',
    '&::after': {
      content: '""',
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: '25%',
      height: '25%',
      borderRadius: radius.full,
      border: `2px solid ${colors.surface}`,
    },
  },
  
  status: {
    online: {
      backgroundColor: colors.safe,
    },
    offline: {
      backgroundColor: colors.border,
    },
    busy: {
      backgroundColor: colors.danger,
    },
    away: {
      backgroundColor: colors.warn,
    },
  },
} as const;

// ═══════════════════════════════════════════════
// PROGRESS BAR COMPONENT
// ═══════════════════════════════════════════════

export const progressBar = {
  base: {
    width: '100%',
    height: '8px',
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  
  track: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
  },
  
  fill: {
    height: '100%',
    borderRadius: radius.full,
    transition: 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  
  variants: {
    gold: {
      backgroundColor: colors.gold,
      background: `linear-gradient(90deg, ${colors.gold}, ${colors.goldLight})`,
    },
    
    safe: {
      backgroundColor: colors.safe,
      background: `linear-gradient(90deg, ${colors.safe}, '#4ADE80')`,
    },
    
    danger: {
      backgroundColor: colors.danger,
      background: `linear-gradient(90deg, ${colors.danger}, '#F87171')`,
    },
    
    active: {
      backgroundColor: colors.active,
      background: `linear-gradient(90deg, ${colors.active}, '#C4B5FD')`,
    },
  },
  
  sizes: {
    sm: {
      height: '4px',
    },
    md: {
      height: '8px',
    },
    lg: {
      height: '12px',
    },
xl: {
      height: '16px',
    },
  },
} as const;

export const menu = {
    position: 'absolute',
    zIndex: 1000,
    minWidth: '200px',
    padding: spacing[2],
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderHi}`,
    boxShadow: shadows.lg,
    overflow: 'hidden',
    transformOrigin: 'top left',
  },
  
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing[3],
    padding: '8px 12px',
    fontSize: typography.scale.sm,
    color: colors.textSecondary,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    width: '100%',
    textAlign: 'left',
    '&:hover': {
      backgroundColor: colors.border,
      color: colors.textPrimary,
    },
    '&:active': {
      backgroundColor: colors.borderHi,
    },
  },
  
  divider: {
    height: '1px',
    backgroundColor: colors.border,
    margin: `${spacing[2]} 0`,
  },
  
  header: {
    padding: '8px 12px',
    fontSize: typography.scale.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  
  footer: {
    padding: '8px 12px',
    fontSize: typography.scale.xs,
    color: colors.textSecondary,
    borderTop: `1px solid ${colors.border}`,
    marginTop: spacing[2],
  },
} as const;

export const tooltip = {
  base: {
    position: 'absolute',
    zIndex: 2000,
    padding: '6px 10px',
    fontSize: typography.scale.xs,
    fontWeight: typography.weights.medium,
    color: colors.textInverse,
    backgroundColor: colors.void,
    borderRadius: radius.sm,
    boxShadow: shadows.md,
    whiteSpace: 'nowrap',
    transform: 'translateY(4px)',
    opacity: 0,
    transition: 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  
  visible: {
    opacity: 1,
    transform: 'translateY(0)',
  },
  
  arrow: {
    position: 'absolute',
    width: '8px',
    height: '8px',
    backgroundColor: colors.void,
    transform: 'rotate(45deg)',
  },
  
  positions: {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%) translateY(4px)',
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%) translateY(-4px)',
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%) translateX(4px)',
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%) translateX(-4px)',
    },
  },
} as const;

// ═══════════════════════════════════════════════
// MODAL COMPONENT
// ═══════════════════════════════════════════════

export const modal = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,12,0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  base: {
    position: 'relative',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    boxShadow: shadows.float,
    animation: 'scaleIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  },
  
  header: {
    padding: spacing[5],
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  body: {
    padding: spacing[5],
    overflowY: 'auto',
    maxHeight: 'calc(90vh - 160px)',
  },
  
  footer: {
    padding: spacing[5],
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[3],
  },
  
  close: {
    position: 'absolute',
    top: spacing[4],
    right: spacing[4],
    width: '32px',
    height: '32px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    color: colors.textSecondary,
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    '&:hover': {
      backgroundColor: colors.border,
      color: colors.textPrimary,
    },
  },
} as const;

// ═══════════════════════════════════════════════
// LOADER / SPINNER COMPONENT
// ═══════════════════════════════════════════════

export const loader = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  sizes: {
    sm: {
      width: '16px',
      height: '16px',
      borderWidth: '2px',
    },
    md: {
      width: '24px',
      height: '24px',
      borderWidth: '3px',
    },
    lg: {
      width: '32px',
      height: '32px',
      borderWidth: '4px',
    },
    xl: {
      width: '48px',
      height: '48px',
      borderWidth: '6px',
    },
  },
  
  variants: {
    gold: {
      borderColor: `${colors.gold} transparent ${colors.gold} transparent`,
      animation: 'spin 1s cubic-bezier(0.16, 1, 0.3, 1) infinite',
    },
    
    safe: {
      borderColor: `${colors.safe} transparent ${colors.safe} transparent`,
      animation: 'spin 1s cubic-bezier(0.16, 1, 0.3, 1) infinite',
    },
danger: {
      borderColor: `${colors.danger} transparent ${colors.danger} transparent`,
      animation: 'spin 1s cubic-bezier(0.16, 1, 0.3, 1) infinite',
    },
  },
} as const;

// ═══════════════════════════════════════════════
// TRUST RINGS CONFIGURATION
// ═══════════════════════════════════════════════

export const trustRings = {
  card: {
    titleColor: colors.textPrimary,
    subColor: colors.textSecondary
  },
  visual: {
    ringColors: {
      readOnly: colors.info,
      draftOnly: colors.active,
      preApproved: colors.gold,
      autonomousAudit: colors.warn,
      fullAutonomy: colors.safe
    },
    centerLogoColor: colors.base,
    cursorColor: colors.textGold
  },
  table: {
    headerColor: colors.textMuted,
    rowBorderColor: colors.border,
    categoryIconColor: colors.textSecondary,
    currentRingDropdown: {
      backgroundColor: colors.overlay,
      borderColor: colors.borderHi,
      textColor: colors.textPrimary
    },
    customizeButtonColor: colors.gold,
    lastActionColor: colors.textSecondary
  }
};

// ═══════════════════════════════════════════════
// NOTIFICATION COMPONENT
// ═══════════════════════════════════════════════

export const notification = {
  success: {
    backgroundColor: colors.success,
    textColor: colors.white,
    borderColor: colors.success
  },
  error: {
    backgroundColor: colors.danger,
    textColor: colors.white,
    borderColor: colors.danger
  },
  warning: {
    backgroundColor: colors.warn,
    textColor: colors.base,
    borderColor: colors.warn
  },
  info: {
    backgroundColor: colors.info,
    textColor: colors.white,
    borderColor: colors.info
  }
};
// ═══════════════════════════════════════════════
// TRUST RINGS CONFIGURATION
// ═══════════════════════════════════════════════

export const trustRings = {
  card: {
    titleColor: colors.textPrimary,
    subColor: colors.textSecondary,
  },
  visual: {
    ringColors: {
      readOnly: colors.info,
      draftOnly: colors.active,
      preApproved: colors.gold,
      autonomousAudit: colors.warn,
      fullAutonomy: colors.safe,
    },
    centerLogoColor: colors.base,
    cursorColor: colors.textGold,
  },
  table: {
    headerColor: colors.textMuted,
    rowBorderColor: colors.border,
    categoryIconColor: colors.textSecondary,
    currentRingDropdown: {
      backgroundColor: colors.overlay,
borderColor: `${colors.danger} transparent ${colors.danger} transparent`,
      animation: 'spin 1s cubic-bezier(0.16, 1, 0.3, 1) infinite',
    },
  },
} as const;

// ═══════════════════════════════════════════════
// TRUST RINGS CONFIGURATION
// ═══════════════════════════════════════════════

export const trustRings = {
  card: {
    titleColor: colors.textPrimary,
    subColor: colors.textSecondary,
  },
  visual: {
    ringColors: {
      readOnly: colors.info,
      draftOnly: colors.active,
      preApproved: colors.gold,
      autonomousAudit: colors.warn,
      fullAutonomy: colors.safe,
    },
    centerLogoColor: colors.base,
    cursorColor: colors.textGold,
  },
  table: {
    headerColor: colors.textMuted,
    rowBorderColor: colors.border,
    categoryIconColor: colors.textSecondary,
    currentRingDropdown: {
      backgroundColor: colors.overlay,
      borderColor: colors.borderHi,
      textColor: colors.textPrimary,
    },
    customizeButtonColor: colors.gold,
    lastActionColor: colors.textSecondary,
  },
} as const;

// ═══════════════════════════════════════════════
// NOTIFICATION COMPONENT
// ═══════════════════════════════════════════════

export const notification = {
  base: {
    position: 'fixed',
    zIndex: 4000,
    minWidth: '300px',
    maxWidth: '400px',
    padding: spacing[4],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderHi}`,
    boxShadow: shadows.lg,
    animation: 'slideRight 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
  },
  
  variants: {
    success: {
      borderLeft: `4px solid ${colors.safe}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '8px',
        height: '8px',
        backgroundColor: colors.safe,
        borderRadius: radius.full,
      },
    },
    
    error: {
      borderLeft: `4px solid ${colors.danger}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '8px',
        height: '8px',
        backgroundColor: colors.danger,
        borderRadius: radius.full,
      },
    },
    
    warning: {
      borderLeft: `4px solid ${colors.warn}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '8px',
        height: '8px',
        backgroundColor: colors.warn,
        borderRadius: radius.full,
      },
    },
    
    info: {
      borderLeft: `4px solid ${colors.info}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '8px',
        height: '8px',
        backgroundColor: colors.info,
        borderRadius: radius.full,
      },
    },
    
    gold: {
      borderLeft: `4px solid ${colors.gold}`,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: '4px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '8px',
        height: '8px',
        backgroundColor: colors.gold,
        borderRadius: radius.full,
      },
    },
  },
  
  positions: {
    topRight: {
      top: spacing[4],
      right: spacing[4],
    },
    
    bottomRight: {
      bottom: spacing[4],
      right: spacing[4],
    },
    
    topLeft: {
      top: spacing[4],
      left: spacing[4],
    },
    
    bottomLeft: {
      bottom: spacing[4],
      left: spacing[4],
    },
  },
  
  close: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: '24px',
    height: '24px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    color: colors.textSecondary,
    transition: 'all 150ms cubic-bezier(0.16, 1, 0.3, 1)',
    '&:hover': {
      backgroundColor: colors.border,
      color: colors.textPrimary,
    },
  },
} as const;