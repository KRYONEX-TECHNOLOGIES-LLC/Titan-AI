/**
 * Project Midnight - Pocket Flow State Graph
 * Defines the state machine: Queue -> Research -> Plan -> Build -> Verify -> Repeat
 */

export type FlowState =
  | 'idle'
  | 'loading'
  | 'research'
  | 'planning'
  | 'building'
  | 'verifying'
  | 'handoff'
  | 'cooldown'
  | 'error';

export interface FlowTransition {
  from: FlowState;
  to: FlowState;
  condition?: () => boolean | Promise<boolean>;
  action?: () => void | Promise<void>;
}

export interface FlowNode {
  state: FlowState;
  onEnter?: () => void | Promise<void>;
  onExit?: () => void | Promise<void>;
  transitions: Map<FlowState, FlowTransition>;
}

type StateCallback = (state: FlowState, previousState: FlowState) => void;

export class PocketFlowEngine {
  private currentState: FlowState = 'idle';
  private nodes: Map<FlowState, FlowNode> = new Map();
  private stateListeners: Set<StateCallback> = new Set();
  private history: FlowState[] = [];
  private maxHistoryLength = 100;

  constructor() {
    this.initializeGraph();
  }

  /**
   * Initialize the state graph
   */
  private initializeGraph(): void {
    // Define all states and their valid transitions
    const transitions: Record<FlowState, FlowState[]> = {
      idle: ['loading'],
      loading: ['research', 'error', 'idle'],
      research: ['planning', 'error', 'idle'],
      planning: ['building', 'error', 'idle'],
      building: ['verifying', 'cooldown', 'error', 'idle'],
      verifying: ['building', 'handoff', 'error', 'idle'],
      handoff: ['loading', 'idle'],
      cooldown: ['building', 'idle'],
      error: ['idle', 'loading'],
    };

    for (const [state, validTargets] of Object.entries(transitions)) {
      const node: FlowNode = {
        state: state as FlowState,
        transitions: new Map(),
      };

      for (const target of validTargets) {
        node.transitions.set(target, {
          from: state as FlowState,
          to: target,
        });
      }

      this.nodes.set(state as FlowState, node);
    }
  }

  /**
   * Get current state
   */
  getState(): FlowState {
    return this.currentState;
  }

  /**
   * Get state history
   */
  getHistory(): FlowState[] {
    return [...this.history];
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: FlowState): boolean {
    const node = this.nodes.get(this.currentState);
    if (!node) return false;
    return node.transitions.has(to);
  }

  /**
   * Transition to a new state
   */
  async transition(to: FlowState): Promise<boolean> {
    const fromNode = this.nodes.get(this.currentState);
    const toNode = this.nodes.get(to);

    if (!fromNode || !toNode) {
      return false;
    }

    const trans = fromNode.transitions.get(to);
    if (!trans) {
      return false;
    }

    // Check condition if exists
    if (trans.condition) {
      const allowed = await trans.condition();
      if (!allowed) return false;
    }

    // Execute onExit
    if (fromNode.onExit) {
      await fromNode.onExit();
    }

    // Record history
    this.history.push(this.currentState);
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }

    const previousState = this.currentState;
    this.currentState = to;

    // Execute transition action
    if (trans.action) {
      await trans.action();
    }

    // Execute onEnter
    if (toNode.onEnter) {
      await toNode.onEnter();
    }

    // Notify listeners
    this.notifyListeners(to, previousState);

    return true;
  }

  /**
   * Force state (for recovery)
   */
  forceState(state: FlowState): void {
    const previousState = this.currentState;
    this.currentState = state;
    this.notifyListeners(state, previousState);
  }

  /**
   * Register a state enter handler
   */
  onEnter(state: FlowState, handler: () => void | Promise<void>): void {
    const node = this.nodes.get(state);
    if (node) {
      node.onEnter = handler;
    }
  }

  /**
   * Register a state exit handler
   */
  onExit(state: FlowState, handler: () => void | Promise<void>): void {
    const node = this.nodes.get(state);
    if (node) {
      node.onExit = handler;
    }
  }

  /**
   * Add a condition to a transition
   */
  setCondition(
    from: FlowState,
    to: FlowState,
    condition: () => boolean | Promise<boolean>
  ): void {
    const node = this.nodes.get(from);
    if (node) {
      const trans = node.transitions.get(to);
      if (trans) {
        trans.condition = condition;
      }
    }
  }

  /**
   * Add an action to a transition
   */
  setAction(
    from: FlowState,
    to: FlowState,
    action: () => void | Promise<void>
  ): void {
    const node = this.nodes.get(from);
    if (node) {
      const trans = node.transitions.get(to);
      if (trans) {
        trans.action = action;
      }
    }
  }

  /**
   * Subscribe to state changes
   */
  on(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(newState: FlowState, previousState: FlowState): void {
    for (const listener of this.stateListeners) {
      try {
        listener(newState, previousState);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Get graph as mermaid diagram
   */
  toMermaid(): string {
    let mermaid = 'stateDiagram-v2\n';

    for (const [state, node] of this.nodes) {
      for (const [target] of node.transitions) {
        mermaid += `    ${state} --> ${target}\n`;
      }
    }

    // Highlight current state
    mermaid += `\n    classDef current fill:#007acc\n`;
    mermaid += `    class ${this.currentState} current\n`;

    return mermaid;
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    this.currentState = 'idle';
    this.history = [];
  }
}

/**
 * Create a new Pocket Flow engine
 */
export function createPocketFlowEngine(): PocketFlowEngine {
  return new PocketFlowEngine();
}

/**
 * State descriptions for UI
 */
export const STATE_DESCRIPTIONS: Record<FlowState, string> = {
  idle: 'Waiting for projects',
  loading: 'Loading project DNA',
  research: 'Researching codebase',
  planning: 'Creating task plan',
  building: 'Actor is building',
  verifying: 'Sentinel is reviewing',
  handoff: 'Handing off to next project',
  cooldown: 'Rate limited, waiting to resume',
  error: 'Error occurred',
};

/**
 * State colors for UI
 */
export const STATE_COLORS: Record<FlowState, string> = {
  idle: '#808080',
  loading: '#007acc',
  research: '#22d3ee',
  planning: '#a371f7',
  building: '#3fb950',
  verifying: '#d97706',
  handoff: '#007acc',
  cooldown: '#f14c4c',
  error: '#f14c4c',
};
