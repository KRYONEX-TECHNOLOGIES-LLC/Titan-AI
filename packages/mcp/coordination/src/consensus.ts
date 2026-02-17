// MCP Consensus Manager
// packages/mcp/coordination/src/consensus.ts

import { EventEmitter } from 'events';
import {
  CoordinatedTask,
  ConsensusProposal,
  VoteDecision,
  AgentResult,
} from './types';

export class ConsensusManager extends EventEmitter {
  private threshold: number;
  private proposals: Map<string, ConsensusProposal> = new Map();
  private consensusTimeout: number = 30000; // 30 seconds

  constructor(threshold: number = 0.66) {
    super();
    this.threshold = threshold;
  }

  async startConsensus(task: CoordinatedTask): Promise<void> {
    const results = Array.from(task.results.values());
    
    // Group similar results
    const groups = this.groupSimilarResults(results);
    
    // Create proposals for each unique result
    for (const [output, agents] of groups) {
      if (agents.length > 0) {
        const proposalId = this.generateId();
        const proposal: ConsensusProposal = {
          id: proposalId,
          taskId: task.id,
          proposerId: agents[0],
          proposal: output,
          votes: new Map(),
          status: 'pending',
          createdAt: Date.now(),
          deadline: Date.now() + this.consensusTimeout,
        };

        // Auto-vote for agents that produced this result
        for (const agentId of agents) {
          proposal.votes.set(agentId, {
            agentId,
            approve: true,
            reason: 'Proposed this result',
            timestamp: Date.now(),
          });
        }

        this.proposals.set(proposalId, proposal);
        this.emit('proposal:created', { proposalId, taskId: task.id, proposal: output });
      }
    }

    // Start voting timer
    setTimeout(() => this.evaluateConsensus(task.id), this.consensusTimeout);
  }

  private groupSimilarResults(results: AgentResult[]): Map<unknown, string[]> {
    const groups = new Map<string, { output: unknown; agents: string[] }>();

    for (const result of results) {
      if (!result.success) continue;

      const key = JSON.stringify(result.output);
      const existing = groups.get(key);
      
      if (existing) {
        existing.agents.push(result.agentId);
      } else {
        groups.set(key, { output: result.output, agents: [result.agentId] });
      }
    }

    const resultMap = new Map<unknown, string[]>();
    for (const { output, agents } of groups.values()) {
      resultMap.set(output, agents);
    }
    return resultMap;
  }

  submitVote(proposalId: string, vote: VoteDecision): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'pending') {
      throw new Error(`Cannot vote on proposal ${proposalId}`);
    }

    proposal.votes.set(vote.agentId, vote);
    this.emit('vote:submitted', { proposalId, vote });

    // Check if we have enough votes
    this.checkConsensusReached(proposal);
  }

  private checkConsensusReached(proposal: ConsensusProposal): void {
    const totalVotes = proposal.votes.size;
    const approvals = Array.from(proposal.votes.values())
      .filter(v => v.approve).length;

    const task = this.getTaskById(proposal.taskId);
    if (!task) return;

    const totalAgents = task.assignedAgents.length;
    const approvalRate = approvals / totalAgents;

    if (approvalRate >= this.threshold) {
      proposal.status = 'accepted';
      this.emit('consensus:reached', {
        taskId: proposal.taskId,
        proposalId: proposal.id,
        proposal: proposal.proposal,
        approvalRate,
      });

      // Reject other proposals for this task
      for (const p of this.proposals.values()) {
        if (p.taskId === proposal.taskId && p.id !== proposal.id) {
          p.status = 'rejected';
        }
      }
    }
  }

  private evaluateConsensus(taskId: string): void {
    const taskProposals = Array.from(this.proposals.values())
      .filter(p => p.taskId === taskId && p.status === 'pending');

    if (taskProposals.length === 0) return;

    // Find proposal with most approvals
    let bestProposal: ConsensusProposal | null = null;
    let bestApprovals = 0;

    for (const proposal of taskProposals) {
      const approvals = Array.from(proposal.votes.values())
        .filter(v => v.approve).length;
      
      if (approvals > bestApprovals) {
        bestApprovals = approvals;
        bestProposal = proposal;
      }
    }

    if (bestProposal) {
      const task = this.getTaskById(taskId);
      if (task) {
        const approvalRate = bestApprovals / task.assignedAgents.length;
        
        if (approvalRate >= this.threshold) {
          bestProposal.status = 'accepted';
          this.emit('consensus:reached', {
            taskId,
            proposalId: bestProposal.id,
            proposal: bestProposal.proposal,
            approvalRate,
          });
        } else {
          this.emit('consensus:failed', {
            taskId,
            reason: `Best approval rate ${approvalRate} below threshold ${this.threshold}`,
            proposals: taskProposals.map(p => ({
              id: p.id,
              approvals: Array.from(p.votes.values()).filter(v => v.approve).length,
            })),
          });
        }
      }
    }

    // Mark all proposals as timed out if none accepted
    for (const proposal of taskProposals) {
      if (proposal.status === 'pending') {
        proposal.status = 'timeout';
      }
    }
  }

  getProposal(proposalId: string): ConsensusProposal | undefined {
    return this.proposals.get(proposalId);
  }

  getProposalsForTask(taskId: string): ConsensusProposal[] {
    return Array.from(this.proposals.values())
      .filter(p => p.taskId === taskId);
  }

  // This should be injected or passed in
  private getTaskById(taskId: string): CoordinatedTask | undefined {
    // Placeholder - in real implementation, this would reference the coordinator
    return undefined;
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  setTimeout(timeoutMs: number): void {
    this.consensusTimeout = timeoutMs;
  }

  private generateId(): string {
    return `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
