'use client';

const EVOLUTION_LS_KEY = 'titan-voice-evolution';

export interface EvolutionStats {
  totalConversations: number;
  totalKnowledgeEntries: number;
  totalSkillsLearned: number;
  totalMistakesAvoided: number;
  totalIdeasGenerated: number;
  totalProjectsCompleted: number;
  totalThoughtsShared: number;
  evolutionLevel: number;
  streak: number;
  lastActiveDate: string;
  milestones: string[];
  createdAt: string;
}

function defaultStats(): EvolutionStats {
  return {
    totalConversations: 0,
    totalKnowledgeEntries: 0,
    totalSkillsLearned: 0,
    totalMistakesAvoided: 0,
    totalIdeasGenerated: 0,
    totalProjectsCompleted: 0,
    totalThoughtsShared: 0,
    evolutionLevel: 1,
    streak: 0,
    lastActiveDate: '',
    milestones: [],
    createdAt: new Date().toISOString(),
  };
}

function loadStats(): EvolutionStats {
  try {
    const raw = localStorage.getItem(EVOLUTION_LS_KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

function saveStats(stats: EvolutionStats) {
  try {
    localStorage.setItem(EVOLUTION_LS_KEY, JSON.stringify(stats));
  } catch { /* quota exceeded */ }
}

function computeLevel(stats: EvolutionStats): number {
  const score =
    stats.totalConversations * 2 +
    stats.totalKnowledgeEntries * 3 +
    stats.totalSkillsLearned * 5 +
    stats.totalMistakesAvoided * 4 +
    stats.totalIdeasGenerated * 3 +
    stats.totalProjectsCompleted * 10 +
    stats.totalThoughtsShared * 1;

  if (score < 50) return 1;
  if (score < 150) return 2;
  if (score < 400) return 3;
  if (score < 800) return 4;
  if (score < 1500) return 5;
  if (score < 3000) return 6;
  if (score < 6000) return 7;
  if (score < 12000) return 8;
  if (score < 25000) return 9;
  return 10;
}

function checkMilestones(stats: EvolutionStats): string[] {
  const milestones: string[] = [];
  if (stats.totalConversations >= 10 && !stats.milestones.includes('first_10_convos'))
    milestones.push('first_10_convos');
  if (stats.totalConversations >= 100 && !stats.milestones.includes('century_convos'))
    milestones.push('century_convos');
  if (stats.totalSkillsLearned >= 10 && !stats.milestones.includes('skill_collector'))
    milestones.push('skill_collector');
  if (stats.totalIdeasGenerated >= 5 && !stats.milestones.includes('idea_machine'))
    milestones.push('idea_machine');
  if (stats.totalMistakesAvoided >= 10 && !stats.milestones.includes('error_proof'))
    milestones.push('error_proof');
  if (stats.totalProjectsCompleted >= 1 && !stats.milestones.includes('first_project'))
    milestones.push('first_project');
  if (stats.streak >= 7 && !stats.milestones.includes('week_streak'))
    milestones.push('week_streak');
  if (stats.evolutionLevel >= 5 && !stats.milestones.includes('level_5'))
    milestones.push('level_5');
  if (stats.evolutionLevel >= 10 && !stats.milestones.includes('level_10'))
    milestones.push('level_10');
  return milestones;
}

function updateStreak(stats: EvolutionStats): number {
  const today = new Date().toISOString().split('T')[0];
  if (stats.lastActiveDate === today) return stats.streak;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (stats.lastActiveDate === yesterday) return stats.streak + 1;

  return 1;
}

// ═══ Public API ═══

export function recordConversation(): void {
  const stats = loadStats();
  stats.totalConversations++;
  stats.streak = updateStreak(stats);
  stats.lastActiveDate = new Date().toISOString().split('T')[0];
  stats.evolutionLevel = computeLevel(stats);
  const newMilestones = checkMilestones(stats);
  stats.milestones = [...stats.milestones, ...newMilestones];
  saveStats(stats);
}

export function recordKnowledge(count = 1): void {
  const stats = loadStats();
  stats.totalKnowledgeEntries += count;
  stats.evolutionLevel = computeLevel(stats);
  saveStats(stats);
}

export function recordSkill(): void {
  const stats = loadStats();
  stats.totalSkillsLearned++;
  stats.evolutionLevel = computeLevel(stats);
  const newMilestones = checkMilestones(stats);
  stats.milestones = [...stats.milestones, ...newMilestones];
  saveStats(stats);
}

export function recordMistakeAvoided(): void {
  const stats = loadStats();
  stats.totalMistakesAvoided++;
  stats.evolutionLevel = computeLevel(stats);
  const newMilestones = checkMilestones(stats);
  stats.milestones = [...stats.milestones, ...newMilestones];
  saveStats(stats);
}

export function recordIdea(): void {
  const stats = loadStats();
  stats.totalIdeasGenerated++;
  stats.evolutionLevel = computeLevel(stats);
  const newMilestones = checkMilestones(stats);
  stats.milestones = [...stats.milestones, ...newMilestones];
  saveStats(stats);
}

export function recordProjectCompleted(): void {
  const stats = loadStats();
  stats.totalProjectsCompleted++;
  stats.evolutionLevel = computeLevel(stats);
  const newMilestones = checkMilestones(stats);
  stats.milestones = [...stats.milestones, ...newMilestones];
  saveStats(stats);
}

export function recordThoughtShared(): void {
  const stats = loadStats();
  stats.totalThoughtsShared++;
  saveStats(stats);
}

export function getEvolutionStats(): EvolutionStats {
  return loadStats();
}

export function getEvolutionSummary(): string {
  const stats = loadStats();
  const lines = [
    `Evolution Level: ${stats.evolutionLevel}/10`,
    `Conversations: ${stats.totalConversations}`,
    `Knowledge: ${stats.totalKnowledgeEntries} entries`,
    `Skills: ${stats.totalSkillsLearned}`,
    `Mistakes avoided: ${stats.totalMistakesAvoided}`,
    `Ideas: ${stats.totalIdeasGenerated}`,
    `Projects: ${stats.totalProjectsCompleted}`,
    `Streak: ${stats.streak} days`,
  ];
  if (stats.milestones.length > 0) {
    lines.push(`Milestones: ${stats.milestones.join(', ')}`);
  }
  return lines.join('\n');
}
