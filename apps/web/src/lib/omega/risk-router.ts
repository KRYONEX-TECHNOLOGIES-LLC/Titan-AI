import type { OmegaConfig, RiskLevel } from './omega-model';

export function selectModelForRisk(risk: RiskLevel, config: OmegaConfig): string {
  switch (risk) {
    case 'low':
      return config.specialistModels.lowRisk;
    case 'high':
      return config.specialistModels.highRisk;
    case 'medium':
    default:
      return config.specialistModels.mediumRisk;
  }
}
