"""
TradeMaster Supreme - Aggressive Risk Manager

Risk management tuned for maximum growth on small accounts.

Philosophy:
- Small accounts NEED to take big risks to grow fast
- A 40% loss on $100 is $40 -- you can recover
- A 40% loss on $100,000 is $40,000 -- that hurts
- So we run loose risk on small accounts, tighten as we grow

Thresholds:
- Phase 1 ($100 - $500):   40% daily loss halt, 50% drawdown halt
- Phase 2 ($500 - $2,500): 30% daily loss halt, 40% drawdown halt
- Phase 3 ($2,500 - $30k): 20% daily loss halt, 30% drawdown halt
- Phase 4 ($30k+):         10% daily loss halt, 20% drawdown halt (normal mode)

Position sizing:
- Phase 1: Up to 40% per trade (full Kelly)
- Phase 2: Up to 30% per trade
- Phase 3: Up to 20% per trade
- Phase 4: Up to 15% per trade (approaching normal)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

from tms.utils.logging import get_logger

logger = get_logger(__name__)


class GrowthPhase(str, Enum):
    """Account growth phases with different risk profiles."""
    SEED = "seed"           # $0 - $500: Maximum aggression
    SPROUT = "sprout"       # $500 - $2,500: High aggression
    GROW = "grow"           # $2,500 - $30,000: Moderate aggression
    MATURE = "mature"       # $30,000+: Controlled aggression


@dataclass
class AggressiveRiskConfig:
    """
    Risk configuration for each growth phase.
    
    As the account grows, risk parameters automatically tighten
    to protect the larger capital base.
    """
    
    # Phase boundaries (equity in USD)
    seed_max: float = 500.0
    sprout_max: float = 2500.0
    grow_max: float = 30000.0
    
    # Max position size per phase (% of equity)
    seed_max_position: float = 0.40      # 40% per trade in seed phase
    sprout_max_position: float = 0.30    # 30% per trade
    grow_max_position: float = 0.20      # 20% per trade
    mature_max_position: float = 0.15    # 15% per trade
    
    # Daily loss halt per phase
    seed_daily_loss_halt: float = 0.40   # Halt at -40% day
    sprout_daily_loss_halt: float = 0.30 # Halt at -30% day
    grow_daily_loss_halt: float = 0.20   # Halt at -20% day
    mature_daily_loss_halt: float = 0.10 # Halt at -10% day
    
    # Max drawdown halt per phase
    seed_drawdown_halt: float = 0.50     # Halt at -50% drawdown
    sprout_drawdown_halt: float = 0.40   # Halt at -40% drawdown
    grow_drawdown_halt: float = 0.30     # Halt at -30% drawdown
    mature_drawdown_halt: float = 0.20   # Halt at -20% drawdown
    
    # Consecutive loss limits (to prevent tilt trading)
    max_consecutive_losses: int = 6      # Stop after 6 losses in a row
    
    # Minimum trade size (don't waste time on tiny trades)
    min_trade_value_usd: float = 5.0


@dataclass
class AggressiveRiskState:
    """Current state of the aggressive risk manager."""
    phase: GrowthPhase
    equity: float
    peak_equity: float
    day_start_equity: float
    
    current_drawdown: float
    daily_pnl_pct: float
    consecutive_losses: int
    
    is_halted: bool
    halt_reason: Optional[str]
    
    max_position_pct: float
    daily_loss_halt_pct: float
    drawdown_halt_pct: float
    
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "phase": self.phase.value,
            "equity": self.equity,
            "peak_equity": self.peak_equity,
            "current_drawdown": self.current_drawdown,
            "daily_pnl_pct": self.daily_pnl_pct,
            "consecutive_losses": self.consecutive_losses,
            "is_halted": self.is_halted,
            "halt_reason": self.halt_reason,
            "max_position_pct": self.max_position_pct,
            "daily_loss_halt_pct": self.daily_loss_halt_pct,
            "drawdown_halt_pct": self.drawdown_halt_pct,
        }


class AggressiveRiskManager:
    """
    Aggressive Risk Manager for maximum growth mode.
    
    Automatically adjusts risk parameters based on account size.
    Small accounts get loose risk. Large accounts get tighter risk.
    
    This is the difference between a $100 account and a $100,000 account:
    - $100 account: Lose 50% = $50 loss. You can reload and try again.
    - $100,000 account: Lose 50% = $50,000 loss. Life-changing damage.
    
    So we scale risk DOWN as the account grows.
    """
    
    def __init__(self, config: Optional[AggressiveRiskConfig] = None):
        self.config = config or AggressiveRiskConfig()
        
        self._equity: float = 100.0
        self._peak_equity: float = 100.0
        self._day_start_equity: float = 100.0
        self._current_date: str = datetime.utcnow().strftime("%Y-%m-%d")
        
        self._consecutive_losses: int = 0
        self._is_halted: bool = False
        self._halt_reason: Optional[str] = None
        
        # Trade history
        self._trade_history: List[Dict[str, Any]] = []
        
        # Milestone tracking (for logging big wins)
        self._milestones_hit: List[float] = []
        self._milestone_targets = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
    
    def get_phase(self, equity: Optional[float] = None) -> GrowthPhase:
        """Determine current growth phase based on equity."""
        eq = equity or self._equity
        
        if eq < self.config.seed_max:
            return GrowthPhase.SEED
        elif eq < self.config.sprout_max:
            return GrowthPhase.SPROUT
        elif eq < self.config.grow_max:
            return GrowthPhase.GROW
        else:
            return GrowthPhase.MATURE
    
    def get_max_position_pct(self, equity: Optional[float] = None) -> float:
        """Get maximum position size for current phase."""
        phase = self.get_phase(equity)
        
        if phase == GrowthPhase.SEED:
            return self.config.seed_max_position
        elif phase == GrowthPhase.SPROUT:
            return self.config.sprout_max_position
        elif phase == GrowthPhase.GROW:
            return self.config.grow_max_position
        else:
            return self.config.mature_max_position
    
    def get_daily_loss_halt(self, equity: Optional[float] = None) -> float:
        """Get daily loss halt threshold for current phase."""
        phase = self.get_phase(equity)
        
        if phase == GrowthPhase.SEED:
            return self.config.seed_daily_loss_halt
        elif phase == GrowthPhase.SPROUT:
            return self.config.sprout_daily_loss_halt
        elif phase == GrowthPhase.GROW:
            return self.config.grow_daily_loss_halt
        else:
            return self.config.mature_daily_loss_halt
    
    def get_drawdown_halt(self, equity: Optional[float] = None) -> float:
        """Get drawdown halt threshold for current phase."""
        phase = self.get_phase(equity)
        
        if phase == GrowthPhase.SEED:
            return self.config.seed_drawdown_halt
        elif phase == GrowthPhase.SPROUT:
            return self.config.sprout_drawdown_halt
        elif phase == GrowthPhase.GROW:
            return self.config.grow_drawdown_halt
        else:
            return self.config.mature_drawdown_halt
    
    def update_equity(self, new_equity: float) -> AggressiveRiskState:
        """
        Update equity and check risk limits.
        
        Returns current risk state including whether trading should halt.
        """
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # New day reset
        if today != self._current_date:
            self._day_start_equity = new_equity
            self._current_date = today
            # Reset halt if it was a daily halt (not drawdown halt)
            if self._is_halted and self._halt_reason and "daily" in self._halt_reason.lower():
                self._is_halted = False
                self._halt_reason = None
                logger.info("AggressiveRisk: Daily halt reset for new trading day")
        
        self._equity = new_equity
        
        # Update peak
        if new_equity > self._peak_equity:
            self._peak_equity = new_equity
            self._check_milestones(new_equity)
        
        # Calculate metrics
        current_drawdown = (self._peak_equity - new_equity) / self._peak_equity if self._peak_equity > 0 else 0.0
        daily_pnl_pct = (new_equity - self._day_start_equity) / self._day_start_equity if self._day_start_equity > 0 else 0.0
        
        phase = self.get_phase(new_equity)
        max_pos = self.get_max_position_pct(new_equity)
        daily_halt = self.get_daily_loss_halt(new_equity)
        dd_halt = self.get_drawdown_halt(new_equity)
        
        # Check halt conditions
        if not self._is_halted:
            if daily_pnl_pct <= -daily_halt:
                self._is_halted = True
                self._halt_reason = f"Daily loss limit hit: {daily_pnl_pct:.1%} (limit: -{daily_halt:.1%})"
                logger.warning(f"AggressiveRisk HALT: {self._halt_reason}")
            
            elif current_drawdown >= dd_halt:
                self._is_halted = True
                self._halt_reason = f"Drawdown limit hit: {current_drawdown:.1%} (limit: {dd_halt:.1%})"
                logger.warning(f"AggressiveRisk HALT: {self._halt_reason}")
            
            elif self._consecutive_losses >= self.config.max_consecutive_losses:
                self._is_halted = True
                self._halt_reason = f"Consecutive loss limit: {self._consecutive_losses} losses in a row"
                logger.warning(f"AggressiveRisk HALT: {self._halt_reason}")
        
        return AggressiveRiskState(
            phase=phase,
            equity=new_equity,
            peak_equity=self._peak_equity,
            day_start_equity=self._day_start_equity,
            current_drawdown=current_drawdown,
            daily_pnl_pct=daily_pnl_pct,
            consecutive_losses=self._consecutive_losses,
            is_halted=self._is_halted,
            halt_reason=self._halt_reason,
            max_position_pct=max_pos,
            daily_loss_halt_pct=daily_halt,
            drawdown_halt_pct=dd_halt,
        )
    
    def record_trade(self, pnl: float, pnl_pct: float, symbol: str = "") -> None:
        """Record a completed trade."""
        self._trade_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "symbol": symbol,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
        })
        
        # Keep last 200 trades
        if len(self._trade_history) > 200:
            self._trade_history.pop(0)
        
        # Update consecutive loss counter
        if pnl_pct < 0:
            self._consecutive_losses += 1
        else:
            self._consecutive_losses = 0  # Reset on any win
        
        logger.info(
            f"AggressiveRisk trade: {symbol} pnl={pnl:.2f} ({pnl_pct:.2%}) | "
            f"consecutive_losses={self._consecutive_losses} | equity={self._equity:.2f}"
        )
    
    def calculate_position_size(
        self,
        equity: float,
        signal_strength: float = 1.0,
        stop_distance_pct: float = 0.025,
    ) -> Dict[str, float]:
        """
        Calculate aggressive position size.
        
        Uses the phase-appropriate Kelly fraction scaled by signal strength.
        
        Args:
            equity: Current account equity
            signal_strength: Signal confidence 0-1
            stop_distance_pct: Stop loss distance as % of price
            
        Returns:
            Dict with position_pct, position_usd, shares_at_price
        """
        max_pct = self.get_max_position_pct(equity)
        
        # Scale by signal strength (strong signals get full size)
        # Minimum 50% of max size even on weak signals
        size_pct = max_pct * max(0.5, signal_strength)
        size_pct = min(max_pct, size_pct)
        
        position_usd = equity * size_pct
        
        # Ensure minimum trade value
        if position_usd < self.config.min_trade_value_usd:
            position_usd = self.config.min_trade_value_usd
            size_pct = position_usd / equity
        
        return {
            "position_pct": size_pct,
            "position_usd": position_usd,
            "max_loss_usd": position_usd * stop_distance_pct,
            "max_loss_pct_of_equity": size_pct * stop_distance_pct,
            "phase": self.get_phase(equity).value,
        }
    
    def _check_milestones(self, equity: float) -> None:
        """Log when account hits major milestones."""
        for target in self._milestone_targets:
            if equity >= target and target not in self._milestones_hit:
                self._milestones_hit.append(target)
                logger.info(
                    f"MILESTONE HIT: Account reached ${target:,.0f}! "
                    f"Current equity: ${equity:,.2f}"
                )
    
    def reset_halt(self, reason: str = "manual") -> None:
        """Manually reset a trading halt."""
        self._is_halted = False
        self._halt_reason = None
        self._consecutive_losses = 0
        logger.info(f"AggressiveRisk: Halt reset ({reason})")
    
    def get_status(self) -> Dict[str, Any]:
        """Get full risk manager status."""
        phase = self.get_phase()
        return {
            "phase": phase.value,
            "equity": self._equity,
            "peak_equity": self._peak_equity,
            "day_start_equity": self._day_start_equity,
            "current_drawdown": (self._peak_equity - self._equity) / self._peak_equity if self._peak_equity > 0 else 0.0,
            "daily_pnl_pct": (self._equity - self._day_start_equity) / self._day_start_equity if self._day_start_equity > 0 else 0.0,
            "consecutive_losses": self._consecutive_losses,
            "is_halted": self._is_halted,
            "halt_reason": self._halt_reason,
            "max_position_pct": self.get_max_position_pct(),
            "daily_loss_halt_pct": self.get_daily_loss_halt(),
            "drawdown_halt_pct": self.get_drawdown_halt(),
            "milestones_hit": self._milestones_hit,
            "total_trades": len(self._trade_history),
        }
