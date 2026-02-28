'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Titan Friend Profile — USER.md equivalent (OpenClaw parity+).
 * Stores everything Alfred needs to know the user as a real friend:
 * identity, preferences per domain, relationship history, correction ledger.
 * Always injected into Hive context for Alfred, chat, and plan execute.
 */

export interface DomainPreference {
  domain: string;
  tone: string;
  detailLevel: 'brief' | 'normal' | 'detailed';
  notes: string;
}

export interface CorrectionEntry {
  id: string;
  original: string;
  corrected: string;
  timestamp: number;
}

export interface RelationshipMilestone {
  id: string;
  event: string;
  timestamp: number;
}

export interface UserProfile {
  name: string;
  callMeBy: string;
  pronouns: string;
  timezone: string;
  email: string;
  locale: string;
  bio: string;
  occupation: string;
  interests: string[];
  annoyances: string[];
  humor: string;
  communicationStyle: string;
  projects: Array<{ name: string; description: string; techStack: string }>;
  domainPreferences: DomainPreference[];
  corrections: CorrectionEntry[];
  milestones: RelationshipMilestone[];
  customNotes: string;
  firstSeenAt: number;
  lastSeenAt: number;
  totalConversations: number;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  callMeBy: '',
  pronouns: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  email: '',
  locale: navigator?.language || 'en-US',
  bio: '',
  occupation: '',
  interests: [],
  annoyances: [],
  humor: '',
  communicationStyle: '',
  projects: [],
  domainPreferences: [],
  corrections: [],
  milestones: [],
  customNotes: '',
  firstSeenAt: Date.now(),
  lastSeenAt: Date.now(),
  totalConversations: 0,
};

interface UserProfileState {
  profile: UserProfile;

  updateProfile: (updates: Partial<UserProfile>) => void;
  addInterest: (interest: string) => void;
  removeInterest: (interest: string) => void;
  addAnnoyance: (annoyance: string) => void;
  addProject: (project: { name: string; description: string; techStack: string }) => void;
  setDomainPreference: (pref: DomainPreference) => void;
  recordCorrection: (original: string, corrected: string) => void;
  addMilestone: (event: string) => void;
  bumpConversation: () => void;

  /** Auto-extract profile info from user messages */
  extractFromMessage: (message: string) => void;

  /** Serialize for system prompt injection */
  serialize: (maxChars?: number) => string;

  clearProfile: () => void;
}

const PROFILE_PATTERNS: Array<{ pattern: RegExp; field: keyof UserProfile; transform?: (m: string) => unknown }> = [
  { pattern: /(?:my name is|i'm|i am|call me) (\w[\w\s]{1,30})/i, field: 'name' },
  { pattern: /(?:call me|you can call me|just call me) (\w[\w\s]{1,20})/i, field: 'callMeBy' },
  { pattern: /(?:my pronouns? (?:is|are)) ([\w/]+)/i, field: 'pronouns' },
  { pattern: /(?:my timezone is|i'm in|i live in timezone) ([\w/+\-]+)/i, field: 'timezone' },
  { pattern: /(?:i work as|i'm a|my job is|my role is|i do) ([\w\s]{3,40})/i, field: 'occupation' },
  { pattern: /(?:i (?:really )?(?:like|love|enjoy|am into)) ([\w\s,]{3,60})/i, field: 'interests', transform: (m: string) => m.split(/,\s*/).map(s => s.trim()).filter(Boolean) },
  { pattern: /(?:i (?:hate|dislike|can't stand|am annoyed by|don't like)) ([\w\s,]{3,60})/i, field: 'annoyances', transform: (m: string) => m.split(/,\s*/).map(s => s.trim()).filter(Boolean) },
];

let corrCounter = 0;
function genCorrId(): string {
  return `corr-${Date.now()}-${++corrCounter}`;
}

export const useUserProfile = create<UserProfileState>()(
  persist(
    (set, get) => ({
      profile: { ...DEFAULT_PROFILE },

      updateProfile: (updates) => set(state => ({
        profile: { ...state.profile, ...updates, lastSeenAt: Date.now() },
      })),

      addInterest: (interest) => set(state => {
        const lower = interest.toLowerCase();
        if (state.profile.interests.some(i => i.toLowerCase() === lower)) return state;
        return { profile: { ...state.profile, interests: [...state.profile.interests, interest] } };
      }),

      removeInterest: (interest) => set(state => ({
        profile: { ...state.profile, interests: state.profile.interests.filter(i => i !== interest) },
      })),

      addAnnoyance: (annoyance) => set(state => {
        const lower = annoyance.toLowerCase();
        if (state.profile.annoyances.some(a => a.toLowerCase() === lower)) return state;
        return { profile: { ...state.profile, annoyances: [...state.profile.annoyances, annoyance] } };
      }),

      addProject: (project) => set(state => {
        const existing = state.profile.projects.find(p => p.name.toLowerCase() === project.name.toLowerCase());
        if (existing) {
          return {
            profile: {
              ...state.profile,
              projects: state.profile.projects.map(p =>
                p.name.toLowerCase() === project.name.toLowerCase() ? { ...p, ...project } : p
              ),
            },
          };
        }
        return { profile: { ...state.profile, projects: [...state.profile.projects, project] } };
      }),

      setDomainPreference: (pref) => set(state => {
        const idx = state.profile.domainPreferences.findIndex(d => d.domain === pref.domain);
        const updated = [...state.profile.domainPreferences];
        if (idx >= 0) updated[idx] = pref;
        else updated.push(pref);
        return { profile: { ...state.profile, domainPreferences: updated } };
      }),

      recordCorrection: (original, corrected) => set(state => ({
        profile: {
          ...state.profile,
          corrections: [...state.profile.corrections.slice(-49), {
            id: genCorrId(),
            original,
            corrected,
            timestamp: Date.now(),
          }],
        },
      })),

      addMilestone: (event) => set(state => ({
        profile: {
          ...state.profile,
          milestones: [...state.profile.milestones, {
            id: `ms-${Date.now()}`,
            event,
            timestamp: Date.now(),
          }],
        },
      })),

      bumpConversation: () => set(state => ({
        profile: {
          ...state.profile,
          totalConversations: state.profile.totalConversations + 1,
          lastSeenAt: Date.now(),
        },
      })),

      extractFromMessage: (message) => {
        const store = get();
        for (const { pattern, field, transform } of PROFILE_PATTERNS) {
          const match = message.match(pattern);
          if (match && match[1]) {
            const value = transform ? transform(match[1].trim()) : match[1].trim();
            if (Array.isArray(value)) {
              for (const v of value) {
                if (field === 'interests') store.addInterest(v);
                if (field === 'annoyances') store.addAnnoyance(v);
              }
            } else if (typeof value === 'string' && value.length > 0) {
              store.updateProfile({ [field]: value } as Partial<UserProfile>);
            }
          }
        }

        // Auto-detect corrections: "no, I meant X" / "actually it's X"
        const corrMatch = message.match(/(?:no[,.]?\s*(?:i meant|it's|it is|actually)|actually[,.]?\s*(?:it's|it is|i meant)) (.{3,80})/i);
        if (corrMatch && corrMatch[1]) {
          store.recordCorrection('(previous response)', corrMatch[1].trim());
        }
      },

      serialize: (maxChars = 1200) => {
        const p = get().profile;
        const parts: string[] = [];
        parts.push('[USER PROFILE — FRIEND CONTEXT]');

        if (p.name) parts.push(`Name: ${p.name}${p.callMeBy && p.callMeBy !== p.name ? ` (call them "${p.callMeBy}")` : ''}`);
        if (p.pronouns) parts.push(`Pronouns: ${p.pronouns}`);
        if (p.timezone) parts.push(`Timezone: ${p.timezone}`);
        if (p.occupation) parts.push(`Occupation: ${p.occupation}`);
        if (p.bio) parts.push(`Bio: ${p.bio}`);
        if (p.communicationStyle) parts.push(`Communication style: ${p.communicationStyle}`);
        if (p.humor) parts.push(`Humor: ${p.humor}`);
        if (p.interests.length > 0) parts.push(`Interests: ${p.interests.join(', ')}`);
        if (p.annoyances.length > 0) parts.push(`Dislikes/annoyances: ${p.annoyances.join(', ')}`);

        if (p.projects.length > 0) {
          parts.push(`Projects: ${p.projects.map(pr => `${pr.name} (${pr.techStack})`).join('; ')}`);
        }

        if (p.domainPreferences.length > 0) {
          parts.push(`Domain prefs: ${p.domainPreferences.map(d => `${d.domain}: ${d.tone}, ${d.detailLevel}`).join('; ')}`);
        }

        if (p.corrections.length > 0) {
          const recent = p.corrections.slice(-5);
          parts.push(`Recent corrections: ${recent.map(c => c.corrected).join('; ')}`);
        }

        if (p.milestones.length > 0) {
          const recent = p.milestones.slice(-3);
          parts.push(`Milestones: ${recent.map(m => m.event).join('; ')}`);
        }

        const daysSinceFirst = Math.floor((Date.now() - p.firstSeenAt) / 86400000);
        parts.push(`Relationship: ${p.totalConversations} conversations over ${daysSinceFirst} days`);

        if (p.customNotes) parts.push(`Notes: ${p.customNotes}`);

        const joined = parts.join('\n');
        return joined.length > maxChars ? joined.slice(0, maxChars) + '...' : joined;
      },

      clearProfile: () => set({ profile: { ...DEFAULT_PROFILE, firstSeenAt: Date.now(), lastSeenAt: Date.now() } }),
    }),
    {
      name: 'titan-user-profile',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);
