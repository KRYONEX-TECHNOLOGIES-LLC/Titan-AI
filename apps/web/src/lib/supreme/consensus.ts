import type { ConsensusVote, SupremeAgentRole } from './supreme-model';

export interface ConsensusFollower {
  role: SupremeAgentRole;
  model: string;
  verify: (change: string) => Promise<{ approved: boolean; rationale: string }>;
}

export interface QuorumResult {
  approved: boolean;
  approvals: number;
  rejections: number;
  required: number;
}

export interface ConsensusResult {
  votes: ConsensusVote[];
  quorum: QuorumResult;
}

export async function collectVotes(change: string, followers: ConsensusFollower[]): Promise<ConsensusVote[]> {
  const votes: ConsensusVote[] = [];
  for (const follower of followers) {
    const result = await follower.verify(change);
    votes.push({
      voter: follower.role,
      model: follower.model,
      approved: result.approved,
      rationale: result.rationale,
    });
  }
  return votes;
}

export function evaluateQuorum(votes: ConsensusVote[], quorumSize: number): QuorumResult {
  const approvals = votes.filter((v) => v.approved).length;
  const rejections = votes.length - approvals;
  return {
    approved: approvals >= quorumSize,
    approvals,
    rejections,
    required: quorumSize,
  };
}

export async function initiateConsensus(
  change: string,
  followers: ConsensusFollower[],
  quorumSize: number,
): Promise<ConsensusResult> {
  const votes = await collectVotes(change, followers);
  const quorum = evaluateQuorum(votes, quorumSize);
  return { votes, quorum };
}
