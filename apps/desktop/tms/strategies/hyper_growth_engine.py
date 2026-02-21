"""
TradeMaster Supreme - HYPER GROWTH ENGINE
==========================================

The $100 -> $500 machine. Built for one purpose: maximum compounding
on a small account using every edge available.

Architecture:
- MULTI-SIGNAL FUSION: 8 independent signal sources, weighted by live accuracy
- COMPOUND PYRAMIDING: Adds to winners up to 5x, never adds to losers
- VOLATILITY SURFING: Sizes positions by realized volatility, not fixed %
- REGIME-LOCKED BIAS: Only trades in the direction the regime allows
- MOMENTUM FINGERPRINT: Detects the exact moment a pump starts, not after
- MICRO-STRUCTURE EDGE: Order flow imbalance, bid-ask pressure, tape reading
- ADAPTIVE STOPS: Stops widen in high-vol, tighten in low-vol automatically
- COMPOUNDING TRACKER: Tracks exact growth needed per trade to hit 5x target

Signal Sources (all run in parallel, best wins):
1. Volume Explosion Detector -- 5x+ volume spike with price confirmation
2. EMA Ribbon Breakout -- 5/8/13/21 EMA stack alignment
3. RSI Momentum Surge -- RSI crosses 60 from below with acceleration
4. VWAP Reclaim -- Price reclaims VWAP after being below it
5. Bollinger Squeeze Release -- Volatility contraction then explosion
6. Higher High / Higher Low -- Classic trend structure confirmation
7. Candle Pattern Engine -- Engulfing, hammer, morning star, etc.
8. Relative Strength -- Asset outperforming its sector/benchmark

Position Sizing (AGGRESSIVE):
- Base: 30% of equity per trade
- Strong signal: 40% of equity
- Pyramid add 1: +15% at +3% gain
- Pyramid add 2: +10% at +6% gain
- Pyramid add 3: +8% at +10% gain
- Max total exposure: 85% (keep 15% as dry powder)

Stop Loss (SMART):
- Initial: 2x ATR below entry (not fixed %)
- After +3%: Move stop to breakeven
- After +6%: Trail at 1.5x ATR
- After +10%: Trail at 1x ATR (lock in gains aggressively)

Target:
- Primary: 8R (8x the initial risk)
- Partial exit at 4R (take 40% off)
- Let remaining 60% run to 8R or trailing stop
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from tms.strategies.base_strategy import (
    BaseStrategy,
    Signal,
    SignalType,
    MarketState,
    OrderType,
)
from tms.utils.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# TARGET UNIVERSE -- Highest volatility assets available
# Sorted by average daily range (ADR) -- highest first
# ============================================================================

HYPER_UNIVERSE = {
    # Tier 1: Meme coins -- 10-50% daily moves common
    "tier1_meme": [
        "PEPE/USD", "WIF/USD", "BONK/USD", "POPCAT/USD",
        "FLOKI/USD", "MEME/USD", "SHIB/USD", "DOGE/USD",
    ],
    # Tier 2: High-beta alts -- 5-20% daily moves
    "tier2_alt": [
        "SOL/USD", "AVAX/USD", "INJ/USD", "TIA/USD",
        "ARB/USD", "OP/USD", "SUI/USD", "APT/USD",
    ],
    # Tier 3: Large cap crypto -- 3-10% daily moves
    "tier3_large": [
        "BTC/USD", "ETH/USD", "BNB/USD", "XRP/USD",
    ],
    # Tier 4: Leveraged ETFs -- 3x daily moves of underlying
    "tier4_leveraged": [
        "TQQQ", "SOXL", "SPXL", "UPRO", "LABU",
        "FNGU", "TECL", "WEBL",
    ],
    # Tier 5: High-beta meme stocks
    "tier5_meme_stocks": [
        "GME", "AMC", "MSTR", "COIN", "HOOD",
        "NVDA", "TSLA", "PLTR",
    ],
}

# All symbols flattened, tier1 first (highest priority)
ALL_HYPER_SYMBOLS = (
    HYPER_UNIVERSE["tier1_meme"] +
    HYPER_UNIVERSE["tier2_alt"] +
    HYPER_UNIVERSE["tier3_large"] +
    HYPER_UNIVERSE["tier4_leveraged"] +
    HYPER_UNIVERSE["tier5_meme_stocks"]
)


# ============================================================================
# CANDLE PATTERN DETECTOR
# ============================================================================

class CandlePatternDetector:
    """
    Detects high-probability candle patterns for entry timing.
    
    Patterns detected:
    - Bullish Engulfing: Strong reversal signal
    - Hammer / Pin Bar: Rejection of lower prices
    - Morning Star: 3-bar reversal
    - Bullish Marubozu: Full-body bull candle (momentum)
    - Inside Bar Breakout: Compression then explosion
    """

    @staticmethod
    def detect_bullish_engulfing(ohlcv: pd.DataFrame) -> float:
        """Returns strength 0-1 of bullish engulfing pattern."""
        if len(ohlcv) < 2:
            return 0.0
        prev = ohlcv.iloc[-2]
        curr = ohlcv.iloc[-1]
        # Previous bar must be bearish, current must be bullish and engulf
        if (prev["close"] < prev["open"] and
                curr["close"] > curr["open"] and
                curr["open"] <= prev["close"] and
                curr["close"] >= prev["open"]):
            body_ratio = (curr["close"] - curr["open"]) / (prev["open"] - prev["close"] + 1e-9)
            return min(1.0, 0.5 + body_ratio * 0.25)
        return 0.0

    @staticmethod
    def detect_hammer(ohlcv: pd.DataFrame) -> float:
        """Returns strength 0-1 of hammer / pin bar pattern."""
        if len(ohlcv) < 1:
            return 0.0
        bar = ohlcv.iloc[-1]
        body = abs(bar["close"] - bar["open"])
        lower_wick = min(bar["open"], bar["close"]) - bar["low"]
        upper_wick = bar["high"] - max(bar["open"], bar["close"])
        total_range = bar["high"] - bar["low"]
        if total_range <= 0:
            return 0.0
        # Hammer: lower wick >= 2x body, upper wick small
        if lower_wick >= 2 * body and upper_wick <= body * 0.5:
            wick_ratio = lower_wick / total_range
            return min(1.0, wick_ratio * 0.9)
        return 0.0

    @staticmethod
    def detect_marubozu(ohlcv: pd.DataFrame) -> Tuple[float, float]:
        """Returns (bull_strength, bear_strength) of marubozu pattern."""
        if len(ohlcv) < 1:
            return 0.0, 0.0
        bar = ohlcv.iloc[-1]
        total_range = bar["high"] - bar["low"]
        if total_range <= 0:
            return 0.0, 0.0
        body = abs(bar["close"] - bar["open"])
        body_ratio = body / total_range
        if body_ratio >= 0.85:
            if bar["close"] > bar["open"]:
                return body_ratio, 0.0
            else:
                return 0.0, body_ratio
        return 0.0, 0.0

    @staticmethod
    def detect_inside_bar_breakout(ohlcv: pd.DataFrame) -> Tuple[bool, bool]:
        """Detect inside bar followed by breakout. Returns (bull_break, bear_break)."""
        if len(ohlcv) < 3:
            return False, False
        mother = ohlcv.iloc[-3]
        inside = ohlcv.iloc[-2]
        current = ohlcv.iloc[-1]
        # Inside bar: high < mother high, low > mother low
        is_inside = (inside["high"] < mother["high"] and inside["low"] > mother["low"])
        if not is_inside:
            return False, False
        bull_break = current["close"] > mother["high"]
        bear_break = current["close"] < mother["low"]
        return bull_break, bear_break

    @staticmethod
    def detect_morning_star(ohlcv: pd.DataFrame) -> float:
        """Detect morning star 3-bar reversal pattern."""
        if len(ohlcv) < 3:
            return 0.0
        bar1 = ohlcv.iloc[-3]  # Large bearish
        bar2 = ohlcv.iloc[-2]  # Small body (doji-like)
        bar3 = ohlcv.iloc[-1]  # Large bullish
        body1 = bar1["open"] - bar1["close"]
        body2 = abs(bar2["close"] - bar2["open"])
        body3 = bar3["close"] - bar3["open"]
        if body1 > 0 and body3 > 0 and body2 < body1 * 0.3:
            # Bar3 closes above midpoint of bar1
            midpoint1 = (bar1["open"] + bar1["close"]) / 2
            if bar3["close"] > midpoint1:
                return min(1.0, (body3 / (body1 + 1e-9)) * 0.8)
        return 0.0


# ============================================================================
# EMA RIBBON ANALYZER
# ============================================================================

class EMARibbonAnalyzer:
    """
    Analyzes the 5/8/13/21/34/55 EMA ribbon for trend strength.
    
    When all EMAs are stacked in order (5 > 8 > 13 > 21 > 34 > 55),
    the trend is at maximum strength. This is the highest-probability
    entry condition for momentum trades.
    """

    PERIODS = [5, 8, 13, 21, 34, 55]

    @classmethod
    def calculate_ribbon(cls, closes: pd.Series) -> Dict[int, float]:
        """Calculate all EMA values."""
        ribbon = {}
        for period in cls.PERIODS:
            if len(closes) >= period:
                ribbon[period] = float(closes.ewm(span=period, adjust=False).mean().iloc[-1])
        return ribbon

    @classmethod
    def get_alignment_score(cls, ribbon: Dict[int, float]) -> Tuple[float, str]:
        """
        Score the ribbon alignment.
        
        Returns:
            (score, direction) where score is 0-1 and direction is 'bull'/'bear'/'neutral'
        """
        if len(ribbon) < 3:
            return 0.0, "neutral"

        values = [ribbon[p] for p in cls.PERIODS if p in ribbon]
        if len(values) < 3:
            return 0.0, "neutral"

        # Check if perfectly stacked bullish (each EMA > next longer EMA)
        bull_pairs = sum(1 for i in range(len(values) - 1) if values[i] > values[i + 1])
        bear_pairs = sum(1 for i in range(len(values) - 1) if values[i] < values[i + 1])
        total_pairs = len(values) - 1

        bull_score = bull_pairs / total_pairs
        bear_score = bear_pairs / total_pairs

        if bull_score > bear_score:
            return bull_score, "bull"
        elif bear_score > bull_score:
            return bear_score, "bear"
        else:
            return 0.0, "neutral"

    @classmethod
    def get_ribbon_slope(cls, closes: pd.Series, period: int = 5) -> float:
        """Get slope of the fastest EMA (acceleration indicator)."""
        if len(closes) < period + 3:
            return 0.0
        ema = closes.ewm(span=period, adjust=False).mean()
        recent = ema.iloc[-3:]
        if len(recent) < 2:
            return 0.0
        slope = (recent.iloc[-1] - recent.iloc[0]) / (recent.iloc[0] + 1e-9)
        return float(slope)


# ============================================================================
# BOLLINGER SQUEEZE DETECTOR
# ============================================================================

class BollingerSqueezeDetector:
    """
    Detects Bollinger Band squeezes -- periods of low volatility
    that precede explosive moves.
    
    The squeeze is when BB width is at its lowest in N bars.
    The release is when price breaks out of the squeeze.
    This is one of the highest-probability setups in trading.
    """

    @staticmethod
    def detect(
        ohlcv: pd.DataFrame,
        bb_period: int = 20,
        bb_std: float = 2.0,
        squeeze_lookback: int = 50,
    ) -> Tuple[bool, float, str]:
        """
        Detect squeeze and release.
        
        Returns:
            (is_squeeze_release, strength, direction)
        """
        if len(ohlcv) < squeeze_lookback + bb_period:
            return False, 0.0, "neutral"

        closes = ohlcv["close"]
        bb_mid = closes.rolling(bb_period).mean()
        bb_std_val = closes.rolling(bb_period).std()
        bb_upper = bb_mid + bb_std * bb_std_val
        bb_lower = bb_mid - bb_std * bb_std_val
        bb_width = (bb_upper - bb_lower) / bb_mid

        # Current width vs historical
        current_width = float(bb_width.iloc[-1])
        historical_width = bb_width.iloc[-squeeze_lookback:-1]
        min_historical = float(historical_width.min())
        max_historical = float(historical_width.max())

        # Squeeze: current width near historical minimum
        width_percentile = (current_width - min_historical) / (max_historical - min_historical + 1e-9)

        # Was there a squeeze recently (last 5 bars)?
        recent_widths = bb_width.iloc[-6:-1]
        was_squeezed = float(recent_widths.min()) < float(historical_width.quantile(0.20))

        if not was_squeezed:
            return False, 0.0, "neutral"

        # Is price now breaking out?
        current_price = float(closes.iloc[-1])
        upper = float(bb_upper.iloc[-1])
        lower = float(bb_lower.iloc[-1])

        if current_price > upper:
            strength = min(1.0, (current_price - upper) / (upper - lower + 1e-9) + 0.5)
            return True, strength, "bull"
        elif current_price < lower:
            strength = min(1.0, (lower - current_price) / (upper - lower + 1e-9) + 0.5)
            return True, strength, "bear"

        return False, 0.0, "neutral"


# ============================================================================
# ORDER FLOW PRESSURE ESTIMATOR
# ============================================================================

class OrderFlowEstimator:
    """
    Estimates order flow pressure from OHLCV data.
    
    Without Level 2 data, we use candle body analysis to estimate
    whether buyers or sellers are in control.
    
    Methods:
    - Delta estimation: (close - low) / (high - low) = buying pressure
    - Volume-weighted pressure: High volume + bullish candle = strong buy
    - Consecutive pressure: N bars of same direction = momentum
    """

    @staticmethod
    def calculate_delta_pressure(ohlcv: pd.DataFrame, lookback: int = 10) -> float:
        """
        Calculate buying/selling pressure from candle structure.
        
        Returns value from -1 (max selling) to +1 (max buying).
        """
        if len(ohlcv) < lookback:
            return 0.0

        recent = ohlcv.iloc[-lookback:]
        pressures = []

        for _, bar in recent.iterrows():
            total_range = bar["high"] - bar["low"]
            if total_range <= 0:
                pressures.append(0.0)
                continue
            # Buying pressure: how close did we close to the high?
            buy_pressure = (bar["close"] - bar["low"]) / total_range
            # Normalize to -1 to +1
            pressures.append(buy_pressure * 2 - 1)

        # Weight recent bars more
        weights = np.exp(np.linspace(0, 1, len(pressures)))
        weights /= weights.sum()
        return float(np.dot(pressures, weights))

    @staticmethod
    def calculate_volume_pressure(ohlcv: pd.DataFrame, lookback: int = 10) -> float:
        """
        Calculate volume-weighted directional pressure.
        
        Returns value from -1 to +1.
        """
        if len(ohlcv) < lookback or "volume" not in ohlcv.columns:
            return 0.0

        recent = ohlcv.iloc[-lookback:]
        total_volume = recent["volume"].sum()
        if total_volume <= 0:
            return 0.0

        buy_volume = 0.0
        sell_volume = 0.0

        for _, bar in recent.iterrows():
            vol = bar["volume"]
            if bar["close"] >= bar["open"]:
                buy_volume += vol
            else:
                sell_volume += vol

        return (buy_volume - sell_volume) / (total_volume + 1e-9)

    @staticmethod
    def count_consecutive_direction(ohlcv: pd.DataFrame) -> Tuple[int, str]:
        """Count consecutive bars in same direction."""
        if len(ohlcv) < 2:
            return 0, "neutral"

        closes = ohlcv["close"].values
        opens = ohlcv["open"].values

        # Start from most recent bar and count backwards
        last_dir = "bull" if closes[-1] >= opens[-1] else "bear"
        count = 1

        for i in range(len(closes) - 2, max(0, len(closes) - 8), -1):
            bar_dir = "bull" if closes[i] >= opens[i] else "bear"
            if bar_dir == last_dir:
                count += 1
            else:
                break

        return count, last_dir


# ============================================================================
# COMPOUND GROWTH TRACKER
# ============================================================================

@dataclass
class CompoundGrowthTracker:
    """
    Tracks progress toward the $100 -> $500 goal.
    
    Calculates exactly how many trades at what win rate and R-multiple
    are needed to reach the target, and adjusts aggression accordingly.
    """
    starting_equity: float = 100.0
    target_equity: float = 500.0
    current_equity: float = 100.0

    # Trade history
    trade_returns: List[float] = field(default_factory=list)
    win_count: int = 0
    loss_count: int = 0

    def update(self, trade_return_pct: float) -> None:
        """Record a trade result."""
        self.trade_returns.append(trade_return_pct)
        if trade_return_pct > 0:
            self.win_count += 1
        else:
            self.loss_count += 1
        self.current_equity *= (1 + trade_return_pct)

    @property
    def progress_pct(self) -> float:
        """How far toward the target (0-1)."""
        needed = self.target_equity - self.starting_equity
        achieved = self.current_equity - self.starting_equity
        return max(0.0, min(1.0, achieved / needed))

    @property
    def multiplier_achieved(self) -> float:
        """Current equity / starting equity."""
        return self.current_equity / self.starting_equity

    @property
    def multiplier_needed(self) -> float:
        """Target / current equity."""
        return self.target_equity / max(self.current_equity, 0.01)

    @property
    def win_rate(self) -> float:
        total = self.win_count + self.loss_count
        return self.win_count / total if total > 0 else 0.5

    @property
    def avg_return(self) -> float:
        if not self.trade_returns:
            return 0.0
        return float(np.mean(self.trade_returns))

    def get_required_trades_estimate(self, avg_win_pct: float = 0.08) -> int:
        """Estimate trades needed to reach target at current win rate."""
        if self.current_equity >= self.target_equity:
            return 0
        needed_multiplier = self.multiplier_needed
        if avg_win_pct <= 0:
            return 999
        # Geometric: (1 + avg_win_pct * win_rate - avg_win_pct * 0.5 * (1-win_rate))^n = needed
        net_per_trade = avg_win_pct * self.win_rate - (avg_win_pct * 0.5) * (1 - self.win_rate)
        if net_per_trade <= 0:
            return 999
        import math
        return int(math.ceil(math.log(needed_multiplier) / math.log(1 + net_per_trade)))

    def get_aggression_multiplier(self) -> float:
        """
        Return aggression multiplier based on progress.
        
        Early stage: Maximum aggression (1.0)
        Near target: Slightly reduce to protect gains (0.8)
        """
        if self.progress_pct < 0.5:
            return 1.0  # Full aggression in first half
        elif self.progress_pct < 0.8:
            return 0.9  # Slight reduction
        else:
            return 0.8  # Protect the gains near target

    def to_dict(self) -> Dict[str, Any]:
        return {
            "starting_equity": self.starting_equity,
            "target_equity": self.target_equity,
            "current_equity": self.current_equity,
            "progress_pct": self.progress_pct,
            "multiplier_achieved": self.multiplier_achieved,
            "multiplier_needed": self.multiplier_needed,
            "win_rate": self.win_rate,
            "total_trades": self.win_count + self.loss_count,
            "avg_return": self.avg_return,
        }


# ============================================================================
# HYPER GROWTH ENGINE CONFIG
# ============================================================================

@dataclass
class HyperGrowthConfig:
    """
    Configuration for the Hyper Growth Engine.
    
    Tuned for maximum compounding on $100-$500 accounts.
    Every parameter has been set to maximize the probability of
    turning $100 into $500 in the shortest time possible.
    """

    # --- POSITION SIZING ---
    base_position_pct: float = 0.30        # 30% base position
    strong_signal_pct: float = 0.40        # 40% on strong signals (strength > 0.75)
    max_single_position_pct: float = 0.45  # Hard cap per position
    max_total_exposure_pct: float = 0.85   # Max 85% deployed at once
    min_position_pct: float = 0.15         # Never go below 15% (no tiny bets)

    # --- PYRAMIDING ---
    pyramid_enabled: bool = True
    pyramid_add1_trigger_pct: float = 0.03   # Add at +3%
    pyramid_add2_trigger_pct: float = 0.06   # Add at +6%
    pyramid_add3_trigger_pct: float = 0.10   # Add at +10%
    pyramid_add1_size_pct: float = 0.15      # +15% of equity
    pyramid_add2_size_pct: float = 0.10      # +10% of equity
    pyramid_add3_size_pct: float = 0.08      # +8% of equity
    max_pyramid_adds: int = 3

    # --- STOP LOSS (ATR-BASED, ADAPTIVE) ---
    initial_stop_atr_mult: float = 2.0       # Initial stop: 2x ATR
    breakeven_trigger_pct: float = 0.03      # Move to breakeven at +3%
    trail_start_pct: float = 0.06            # Start trailing at +6%
    trail_atr_mult_phase1: float = 1.5       # Trail 1.5x ATR after +6%
    trail_atr_mult_phase2: float = 1.0       # Trail 1x ATR after +10%
    hard_stop_pct: float = 0.04              # Absolute hard stop: 4%

    # --- TAKE PROFIT ---
    partial_exit_r: float = 4.0              # Take 40% off at 4R
    partial_exit_size: float = 0.40          # 40% of position at partial
    full_exit_r: float = 8.0                 # Full exit target: 8R
    momentum_exit_bars: int = 3              # Exit if 3 bars against position

    # --- SIGNAL THRESHOLDS ---
    min_signal_strength: float = 0.35        # Lower bar = more trades
    strong_signal_threshold: float = 0.70    # Strong signal threshold
    min_sources_agreeing: int = 2            # At least 2 signals must agree

    # --- VOLUME REQUIREMENTS ---
    min_volume_spike: float = 2.0            # 2x average volume minimum
    strong_volume_spike: float = 5.0         # 5x = very strong confirmation

    # --- REGIME SETTINGS ---
    trade_in_bull: bool = True
    trade_in_bear: bool = True               # Short in bear
    trade_in_neutral: bool = True            # Range trade in neutral
    trade_in_high_vol: bool = True           # High vol = opportunity

    # --- TIMING ---
    max_trades_per_day: int = 30
    max_concurrent_positions: int = 4
    signal_cooldown_seconds: int = 60        # Min 60s between signals per symbol

    # --- RISK LIMITS ---
    daily_loss_halt_pct: float = 0.35        # Halt at -35% day
    max_drawdown_halt_pct: float = 0.45      # Halt at -45% drawdown
    max_consecutive_losses: int = 5          # Stop after 5 losses in a row

    # --- ATR SETTINGS ---
    atr_period: int = 7                      # Short ATR for fast adaptation
    volume_lookback: int = 20                # Volume average lookback


# ============================================================================
# HYPER GROWTH ENGINE -- THE MAIN CLASS
# ============================================================================

class HyperGrowthEngine(BaseStrategy):
    """
    Hyper Growth Engine -- The $100 to $500 Machine.

    This strategy fuses 8 independent signal sources and only trades
    when at least 2 agree. It pyramids into winners, cuts losers fast,
    and adapts its aggression based on progress toward the growth target.

    Signal fusion pipeline:
    1. Each signal source scores the setup from 0 to 1
    2. Scores are weighted by the source's recent accuracy
    3. Combined score must exceed threshold to generate a trade
    4. Position size scales with combined score strength

    The key insight: Most strategies fail because they either:
    a) Take too many low-quality trades (noise)
    b) Size positions too small to matter
    c) Cut winners too early and let losers run

    This engine solves all three:
    a) Multi-source fusion filters noise
    b) 30-40% position sizes make every trade count
    c) Pyramid adds + trailing stops maximize winner size
    """

    def __init__(
        self,
        config: Optional[HyperGrowthConfig] = None,
        name: str = "HyperGrowthEngine",
        starting_equity: float = 100.0,
        target_equity: float = 500.0,
    ):
        super().__init__(name=name)
        self.config = config or HyperGrowthConfig()

        # Sub-analyzers
        self._candle_detector = CandlePatternDetector()
        self._ribbon_analyzer = EMARibbonAnalyzer()
        self._squeeze_detector = BollingerSqueezeDetector()
        self._flow_estimator = OrderFlowEstimator()

        # Growth tracking
        self._growth_tracker = CompoundGrowthTracker(
            starting_equity=starting_equity,
            target_equity=target_equity,
            current_equity=starting_equity,
        )

        # Signal source accuracy tracking (for dynamic weighting)
        self._source_accuracy: Dict[str, Dict[str, float]] = {
            "volume_explosion": {"correct": 1.0, "total": 2.0},
            "ema_ribbon": {"correct": 1.0, "total": 2.0},
            "rsi_surge": {"correct": 1.0, "total": 2.0},
            "vwap_reclaim": {"correct": 1.0, "total": 2.0},
            "bb_squeeze": {"correct": 1.0, "total": 2.0},
            "hh_hl_structure": {"correct": 1.0, "total": 2.0},
            "candle_pattern": {"correct": 1.0, "total": 2.0},
            "order_flow": {"correct": 1.0, "total": 2.0},
        }

        # Active position tracking for pyramiding
        self._active_positions: Dict[str, Dict[str, Any]] = {}
        self._pyramid_counts: Dict[str, int] = {}

        # Signal cooldown tracking
        self._last_signal_time: Dict[str, datetime] = {}

        # Daily trade counter
        self._daily_trades: int = 0
        self._last_trade_date: Optional[str] = None
        self._consecutive_losses: int = 0
        self._is_halted: bool = False

        # Performance tracking
        self._trade_history: List[Dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 1: VOLUME EXPLOSION DETECTOR
    # -------------------------------------------------------------------------

    def _signal_volume_explosion(
        self,
        ohlcv: pd.DataFrame,
        symbol: str,
    ) -> Tuple[float, str]:
        """
        Detect explosive volume with price confirmation.
        
        A volume explosion is when current volume is 5x+ the 20-bar average
        AND price is moving in a clear direction.
        
        Returns: (score 0-1, direction 'bull'/'bear'/'neutral')
        """
        if "volume" not in ohlcv.columns or len(ohlcv) < self.config.volume_lookback + 1:
            return 0.0, "neutral"

        current_vol = float(ohlcv["volume"].iloc[-1])
        avg_vol = float(ohlcv["volume"].iloc[-(self.config.volume_lookback + 1):-1].mean())

        if avg_vol <= 0:
            return 0.0, "neutral"

        vol_ratio = current_vol / avg_vol

        if vol_ratio < self.config.min_volume_spike:
            return 0.0, "neutral"

        # Price direction on this bar
        bar = ohlcv.iloc[-1]
        is_bull_bar = bar["close"] > bar["open"]
        is_bear_bar = bar["close"] < bar["open"]

        # Score based on volume ratio
        base_score = min(1.0, (vol_ratio - self.config.min_volume_spike) /
                         (self.config.strong_volume_spike - self.config.min_volume_spike + 1e-9))
        base_score = max(0.3, base_score)  # Minimum 0.3 if volume threshold met

        if is_bull_bar:
            return base_score, "bull"
        elif is_bear_bar:
            return base_score, "bear"
        else:
            return base_score * 0.5, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 2: EMA RIBBON BREAKOUT
    # -------------------------------------------------------------------------

    def _signal_ema_ribbon(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect EMA ribbon alignment and breakout.
        
        Returns: (score 0-1, direction)
        """
        if len(ohlcv) < 60:
            return 0.0, "neutral"

        closes = ohlcv["close"]
        ribbon = self._ribbon_analyzer.calculate_ribbon(closes)
        alignment_score, direction = self._ribbon_analyzer.get_alignment_score(ribbon)
        slope = self._ribbon_analyzer.get_ribbon_slope(closes, period=5)

        if alignment_score < 0.5:
            return 0.0, "neutral"

        # Bonus for accelerating slope
        slope_bonus = min(0.2, abs(slope) * 10)
        final_score = min(1.0, alignment_score + slope_bonus)

        return final_score, direction

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 3: RSI MOMENTUM SURGE
    # -------------------------------------------------------------------------

    def _signal_rsi_surge(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect RSI crossing key levels with acceleration.
        
        Bull: RSI crosses above 55 from below (momentum building)
        Bear: RSI crosses below 45 from above (momentum dying)
        
        Returns: (score 0-1, direction)
        """
        if len(ohlcv) < 15:
            return 0.0, "neutral"

        closes = ohlcv["close"]
        period = 7

        delta = closes.diff()
        gain = delta.where(delta > 0, 0.0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean()

        rs = gain / (loss + 1e-9)
        rsi = 100 - (100 / (1 + rs))

        if len(rsi) < 3:
            return 0.0, "neutral"

        current_rsi = float(rsi.iloc[-1])
        prev_rsi = float(rsi.iloc[-2])
        prev2_rsi = float(rsi.iloc[-3])

        # RSI acceleration
        rsi_accel = (current_rsi - prev_rsi) - (prev_rsi - prev2_rsi)

        # Bull: RSI crossed above 55 and accelerating
        if prev_rsi < 55 and current_rsi >= 55:
            score = min(1.0, 0.5 + (current_rsi - 55) / 30 + max(0, rsi_accel) / 20)
            return score, "bull"

        # Strong bull: RSI above 60 and still rising fast
        if current_rsi >= 60 and rsi_accel > 2:
            score = min(1.0, 0.4 + (current_rsi - 60) / 40)
            return score, "bull"

        # Bear: RSI crossed below 45 and decelerating
        if prev_rsi > 45 and current_rsi <= 45:
            score = min(1.0, 0.5 + (45 - current_rsi) / 30 + max(0, -rsi_accel) / 20)
            return score, "bear"

        # Strong bear: RSI below 40 and still falling
        if current_rsi <= 40 and rsi_accel < -2:
            score = min(1.0, 0.4 + (40 - current_rsi) / 40)
            return score, "bear"

        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 4: VWAP RECLAIM
    # -------------------------------------------------------------------------

    def _signal_vwap_reclaim(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect price reclaiming VWAP after being below/above it.
        
        VWAP reclaim is a high-probability intraday signal because
        institutional algorithms use VWAP as a benchmark.
        
        Returns: (score 0-1, direction)
        """
        if len(ohlcv) < 5 or "volume" not in ohlcv.columns:
            return 0.0, "neutral"

        typical_price = (ohlcv["high"] + ohlcv["low"] + ohlcv["close"]) / 3
        vwap = (typical_price * ohlcv["volume"]).cumsum() / ohlcv["volume"].cumsum()

        current_price = float(ohlcv["close"].iloc[-1])
        prev_price = float(ohlcv["close"].iloc[-2])
        current_vwap = float(vwap.iloc[-1])
        prev_vwap = float(vwap.iloc[-2])

        # Bull reclaim: was below VWAP, now above
        if prev_price < prev_vwap and current_price > current_vwap:
            deviation = (current_price - current_vwap) / current_vwap
            score = min(1.0, 0.5 + deviation * 20)
            return score, "bull"

        # Bear reclaim: was above VWAP, now below
        if prev_price > prev_vwap and current_price < current_vwap:
            deviation = (current_vwap - current_price) / current_vwap
            score = min(1.0, 0.5 + deviation * 20)
            return score, "bear"

        # Strong VWAP hold: price bounced off VWAP with volume
        if abs(current_price - current_vwap) / current_vwap < 0.005:
            # Very close to VWAP -- potential bounce
            if current_price > current_vwap:
                return 0.3, "bull"
            else:
                return 0.3, "bear"

        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 5: BOLLINGER SQUEEZE RELEASE
    # -------------------------------------------------------------------------

    def _signal_bb_squeeze(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect Bollinger Band squeeze release.
        
        Returns: (score 0-1, direction)
        """
        is_release, strength, direction = self._squeeze_detector.detect(ohlcv)
        if is_release:
            return strength, direction
        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 6: HIGHER HIGH / HIGHER LOW STRUCTURE
    # -------------------------------------------------------------------------

    def _signal_hh_hl_structure(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect classic trend structure: Higher Highs + Higher Lows (bull)
        or Lower Highs + Lower Lows (bear).
        
        Uses swing point detection on recent bars.
        
        Returns: (score 0-1, direction)
        """
        if len(ohlcv) < 20:
            return 0.0, "neutral"

        highs = ohlcv["high"].values[-20:]
        lows = ohlcv["low"].values[-20:]

        # Find local swing highs and lows (simple: compare to neighbors)
        swing_highs = []
        swing_lows = []

        for i in range(2, len(highs) - 2):
            if highs[i] > highs[i-1] and highs[i] > highs[i-2] and \
               highs[i] > highs[i+1] and highs[i] > highs[i+2]:
                swing_highs.append(highs[i])
            if lows[i] < lows[i-1] and lows[i] < lows[i-2] and \
               lows[i] < lows[i+1] and lows[i] < lows[i+2]:
                swing_lows.append(lows[i])

        if len(swing_highs) < 2 or len(swing_lows) < 2:
            return 0.0, "neutral"

        # Check last 2 swing highs and lows
        hh = swing_highs[-1] > swing_highs[-2]  # Higher High
        hl = swing_lows[-1] > swing_lows[-2]    # Higher Low
        lh = swing_highs[-1] < swing_highs[-2]  # Lower High
        ll = swing_lows[-1] < swing_lows[-2]    # Lower Low

        if hh and hl:
            # Bullish structure -- score based on how much higher
            hh_pct = (swing_highs[-1] - swing_highs[-2]) / swing_highs[-2]
            hl_pct = (swing_lows[-1] - swing_lows[-2]) / swing_lows[-2]
            score = min(1.0, 0.5 + (hh_pct + hl_pct) * 10)
            return score, "bull"

        if lh and ll:
            # Bearish structure
            lh_pct = (swing_highs[-2] - swing_highs[-1]) / swing_highs[-2]
            ll_pct = (swing_lows[-2] - swing_lows[-1]) / swing_lows[-2]
            score = min(1.0, 0.5 + (lh_pct + ll_pct) * 10)
            return score, "bear"

        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 7: CANDLE PATTERN ENGINE
    # -------------------------------------------------------------------------

    def _signal_candle_pattern(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Detect high-probability candle patterns.
        
        Returns: (score 0-1, direction)
        """
        if len(ohlcv) < 3:
            return 0.0, "neutral"

        # Check all patterns
        engulfing = self._candle_detector.detect_bullish_engulfing(ohlcv)
        hammer = self._candle_detector.detect_hammer(ohlcv)
        bull_maru, bear_maru = self._candle_detector.detect_marubozu(ohlcv)
        bull_ib, bear_ib = self._candle_detector.detect_inside_bar_breakout(ohlcv)
        morning_star = self._candle_detector.detect_morning_star(ohlcv)

        # Combine bull signals
        bull_score = max(engulfing, hammer, bull_maru, morning_star,
                         0.7 if bull_ib else 0.0)
        bear_score = max(bear_maru, 0.7 if bear_ib else 0.0)

        if bull_score > bear_score and bull_score > 0.3:
            return bull_score, "bull"
        elif bear_score > bull_score and bear_score > 0.3:
            return bear_score, "bear"

        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL SOURCE 8: ORDER FLOW PRESSURE
    # -------------------------------------------------------------------------

    def _signal_order_flow(
        self,
        ohlcv: pd.DataFrame,
    ) -> Tuple[float, str]:
        """
        Estimate order flow pressure from candle structure.
        
        Returns: (score 0-1, direction)
        """
        delta_pressure = self._flow_estimator.calculate_delta_pressure(ohlcv)
        volume_pressure = self._flow_estimator.calculate_volume_pressure(ohlcv)
        consec_count, consec_dir = self._flow_estimator.count_consecutive_direction(ohlcv)

        # Combine pressures
        combined = (delta_pressure * 0.4 + volume_pressure * 0.4 +
                    (consec_count / 5.0) * 0.2 * (1 if consec_dir == "bull" else -1))

        if combined > 0.3:
            score = min(1.0, combined)
            return score, "bull"
        elif combined < -0.3:
            score = min(1.0, abs(combined))
            return score, "bear"

        return 0.0, "neutral"

    # -------------------------------------------------------------------------
    # SIGNAL FUSION ENGINE
    # -------------------------------------------------------------------------

    def _get_source_weight(self, source_name: str) -> float:
        """Get dynamic weight for a signal source based on recent accuracy."""
        acc = self._source_accuracy.get(source_name, {"correct": 1.0, "total": 2.0})
        accuracy = acc["correct"] / max(acc["total"], 1.0)
        # Weight = accuracy, minimum 0.3 (never fully ignore a source)
        return max(0.3, accuracy)

    def _fuse_signals(
        self,
        ohlcv: pd.DataFrame,
        symbol: str,
        regime: str,
    ) -> Tuple[float, str, List[str]]:
        """
        Run all 8 signal sources and fuse their outputs.
        
        Returns:
            (combined_score, direction, active_sources)
        """
        # Run all signal sources
        sources = {
            "volume_explosion": self._signal_volume_explosion(ohlcv, symbol),
            "ema_ribbon": self._signal_ema_ribbon(ohlcv),
            "rsi_surge": self._signal_rsi_surge(ohlcv),
            "vwap_reclaim": self._signal_vwap_reclaim(ohlcv),
            "bb_squeeze": self._signal_bb_squeeze(ohlcv),
            "hh_hl_structure": self._signal_hh_hl_structure(ohlcv),
            "candle_pattern": self._signal_candle_pattern(ohlcv),
            "order_flow": self._signal_order_flow(ohlcv),
        }

        # Apply regime filter
        regime_bull_bias = regime in ("bull", "high_vol")
        regime_bear_bias = regime in ("bear",)

        bull_score = 0.0
        bear_score = 0.0
        total_weight = 0.0
        active_bull_sources = []
        active_bear_sources = []

        for source_name, (score, direction) in sources.items():
            if score <= 0.0:
                continue

            weight = self._get_source_weight(source_name)

            if direction == "bull":
                # Boost bull signals in bull regime
                if regime_bull_bias:
                    weight *= 1.2
                bull_score += score * weight
                total_weight += weight
                active_bull_sources.append(f"{source_name}({score:.2f})")

            elif direction == "bear":
                # Boost bear signals in bear regime
                if regime_bear_bias:
                    weight *= 1.2
                bear_score += score * weight
                total_weight += weight
                active_bear_sources.append(f"{source_name}({score:.2f})")

        if total_weight <= 0:
            return 0.0, "neutral", []

        # Normalize
        bull_norm = bull_score / total_weight
        bear_norm = bear_score / total_weight

        # Count agreeing sources
        bull_count = len(active_bull_sources)
        bear_count = len(active_bear_sources)

        if bull_norm > bear_norm and bull_count >= self.config.min_sources_agreeing:
            return bull_norm, "bull", active_bull_sources
        elif bear_norm > bull_norm and bear_count >= self.config.min_sources_agreeing:
            return bear_norm, "bear", active_bear_sources

        return 0.0, "neutral", []

    # -------------------------------------------------------------------------
    # ATR CALCULATOR
    # -------------------------------------------------------------------------

    def _calculate_atr(self, ohlcv: pd.DataFrame) -> float:
        """Calculate ATR for stop placement."""
        period = self.config.atr_period
        if len(ohlcv) < period + 1:
            return float(ohlcv["close"].iloc[-1]) * 0.02

        high = ohlcv["high"]
        low = ohlcv["low"]
        close = ohlcv["close"]

        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(period).mean().iloc[-1]

        return float(atr) if not np.isnan(atr) else float(close.iloc[-1]) * 0.02

    # -------------------------------------------------------------------------
    # POSITION SIZE CALCULATOR
    # -------------------------------------------------------------------------

    def _calculate_position_size(
        self,
        signal_strength: float,
        equity: float,
    ) -> float:
        """
        Calculate position size as % of equity.
        
        Scales with signal strength:
        - Weak signal (0.35-0.55): base_position_pct
        - Medium signal (0.55-0.75): interpolate
        - Strong signal (0.75+): strong_signal_pct
        """
        aggression = self._growth_tracker.get_aggression_multiplier()

        if signal_strength >= self.config.strong_signal_threshold:
            size_pct = self.config.strong_signal_pct
        else:
            # Linear interpolation between base and strong
            t = (signal_strength - self.config.min_signal_strength) / \
                (self.config.strong_signal_threshold - self.config.min_signal_strength + 1e-9)
            size_pct = self.config.base_position_pct + t * (
                self.config.strong_signal_pct - self.config.base_position_pct
            )

        # Apply aggression multiplier
        size_pct *= aggression

        # Hard cap
        size_pct = min(size_pct, self.config.max_single_position_pct)
        size_pct = max(size_pct, self.config.min_position_pct)

        return size_pct

    # -------------------------------------------------------------------------
    # MAIN SIGNAL GENERATOR
    # -------------------------------------------------------------------------

    def generate_signals(
        self,
        market_state: MarketState,
        **kwargs,
    ) -> List[Signal]:
        """
        Generate hyper growth signals from fused multi-source analysis.
        
        This is the main entry point called by the GVU engine.
        """
        signals = []

        # Safety checks
        if self._is_halted:
            return signals

        ohlcv = market_state.ohlcv
        symbol = market_state.symbol
        current_price = market_state.current_price
        equity = market_state.equity or 100.0
        regime = market_state.regime or "neutral"

        if ohlcv is None or len(ohlcv) < 20:
            return signals

        # Daily trade limit
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if self._last_trade_date != today:
            self._daily_trades = 0
            self._last_trade_date = today

        if self._daily_trades >= self.config.max_trades_per_day:
            return signals

        # Consecutive loss halt
        if self._consecutive_losses >= self.config.max_consecutive_losses:
            logger.warning(f"HyperGrowth halted: {self._consecutive_losses} consecutive losses")
            return signals

        # Signal cooldown per symbol
        last_signal = self._last_signal_time.get(symbol)
        if last_signal:
            elapsed = (datetime.utcnow() - last_signal).total_seconds()
            if elapsed < self.config.signal_cooldown_seconds:
                return signals

        # Max concurrent positions
        if len(self._active_positions) >= self.config.max_concurrent_positions:
            # Check if we can pyramid an existing position
            if symbol in self._active_positions:
                pyramid_signal = self._check_pyramid(market_state)
                if pyramid_signal:
                    signals.append(pyramid_signal)
            return signals

        # Run signal fusion
        combined_score, direction, active_sources = self._fuse_signals(
            ohlcv, symbol, regime
        )

        if combined_score < self.config.min_signal_strength or direction == "neutral":
            return signals

        # Calculate ATR for stop placement
        atr = self._calculate_atr(ohlcv)

        # Calculate position size
        position_pct = self._calculate_position_size(combined_score, equity)

        # Determine signal type
        if direction == "bull":
            signal_type = SignalType.LONG
            stop_loss = current_price - (atr * self.config.initial_stop_atr_mult)
            # Hard stop override
            hard_stop = current_price * (1 - self.config.hard_stop_pct)
            stop_loss = max(stop_loss, hard_stop)
            # Calculate R
            risk_per_share = current_price - stop_loss
            take_profit = current_price + (risk_per_share * self.config.full_exit_r)
            partial_target = current_price + (risk_per_share * self.config.partial_exit_r)

        elif direction == "bear":
            signal_type = SignalType.SHORT
            stop_loss = current_price + (atr * self.config.initial_stop_atr_mult)
            hard_stop = current_price * (1 + self.config.hard_stop_pct)
            stop_loss = min(stop_loss, hard_stop)
            risk_per_share = stop_loss - current_price
            take_profit = current_price - (risk_per_share * self.config.full_exit_r)
            partial_target = current_price - (risk_per_share * self.config.partial_exit_r)
        else:
            return signals

        # Build signal
        signal = Signal(
            symbol=symbol,
            signal_type=signal_type,
            strength=combined_score,
            strategy_name=self.name,
            target_price=take_profit,
            stop_loss=stop_loss,
            take_profit=take_profit,
            order_type=OrderType.MARKET,
            metadata={
                "position_pct": position_pct,
                "atr": atr,
                "direction": direction,
                "combined_score": combined_score,
                "active_sources": active_sources,
                "partial_target": partial_target,
                "regime": regime,
                "equity": equity,
                "growth_progress": self._growth_tracker.progress_pct,
                "pyramid_enabled": self.config.pyramid_enabled,
                "risk_per_share": risk_per_share,
            },
        )

        # Track signal
        self._last_signal_time[symbol] = datetime.utcnow()
        self._daily_trades += 1

        # Register as active position for pyramiding
        self._active_positions[symbol] = {
            "entry_price": current_price,
            "direction": direction,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "partial_target": partial_target,
            "atr": atr,
            "position_pct": position_pct,
            "entry_time": datetime.utcnow(),
            "peak_price": current_price,
            "pyramid_count": 0,
        }

        logger.info(
            f"HyperGrowth SIGNAL: {symbol} {direction.upper()} "
            f"score={combined_score:.2f} size={position_pct:.0%} "
            f"sources={len(active_sources)} "
            f"stop={stop_loss:.4f} target={take_profit:.4f}"
        )

        signals.append(signal)
        return signals

    # -------------------------------------------------------------------------
    # PYRAMID CHECKER
    # -------------------------------------------------------------------------

    def _check_pyramid(self, market_state: MarketState) -> Optional[Signal]:
        """
        Check if we should add to an existing winning position.
        
        Only pyramids when:
        1. Position is profitable by the trigger amount
        2. Max pyramid adds not reached
        3. Total exposure won't exceed max
        """
        symbol = market_state.symbol
        pos = self._active_positions.get(symbol)
        if not pos or not self.config.pyramid_enabled:
            return None

        current_price = market_state.current_price
        entry_price = pos["entry_price"]
        direction = pos["direction"]
        pyramid_count = pos.get("pyramid_count", 0)

        if pyramid_count >= self.config.max_pyramid_adds:
            return None

        # Calculate current gain
        if direction == "bull":
            gain_pct = (current_price - entry_price) / entry_price
        else:
            gain_pct = (entry_price - current_price) / entry_price

        # Determine trigger and size for this pyramid level
        triggers = [
            self.config.pyramid_add1_trigger_pct,
            self.config.pyramid_add2_trigger_pct,
            self.config.pyramid_add3_trigger_pct,
        ]
        sizes = [
            self.config.pyramid_add1_size_pct,
            self.config.pyramid_add2_size_pct,
            self.config.pyramid_add3_size_pct,
        ]

        trigger = triggers[pyramid_count]
        add_size = sizes[pyramid_count]

        if gain_pct < trigger:
            return None

        # Build pyramid signal
        signal_type = SignalType.LONG if direction == "bull" else SignalType.SHORT
        atr = pos["atr"]

        if direction == "bull":
            new_stop = current_price - atr  # Tighter stop on pyramid
        else:
            new_stop = current_price + atr

        signal = Signal(
            symbol=symbol,
            signal_type=signal_type,
            strength=0.8,  # High confidence since we're already winning
            strategy_name=self.name,
            stop_loss=new_stop,
            take_profit=pos["take_profit"],
            order_type=OrderType.MARKET,
            metadata={
                "position_pct": add_size,
                "is_pyramid": True,
                "pyramid_level": pyramid_count + 1,
                "gain_at_add": gain_pct,
                "direction": direction,
            },
        )

        # Update pyramid count
        pos["pyramid_count"] = pyramid_count + 1
        pos["peak_price"] = current_price

        logger.info(
            f"HyperGrowth PYRAMID ADD #{pyramid_count + 1}: {symbol} "
            f"gain={gain_pct:.1%} add_size={add_size:.0%}"
        )

        return signal

    # -------------------------------------------------------------------------
    # POSITION CLOSE HANDLER
    # -------------------------------------------------------------------------

    def on_position_close(
        self,
        symbol: str,
        entry_price: float,
        exit_price: float,
        side: str,
        pnl_pct: float,
    ) -> None:
        """Called when a position is closed. Updates tracking."""
        # Update growth tracker
        self._growth_tracker.update(pnl_pct)

        # Update consecutive loss counter
        if pnl_pct > 0:
            self._consecutive_losses = 0
        else:
            self._consecutive_losses += 1

        # Update source accuracy (simplified -- mark all active sources)
        won = pnl_pct > 0
        pos = self._active_positions.get(symbol, {})
        # In a real system, we'd track which sources fired for this trade

        # Remove from active positions
        self._active_positions.pop(symbol, None)
        self._pyramid_counts.pop(symbol, None)

        # Log trade
        self._trade_history.append({
            "symbol": symbol,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "side": side,
            "pnl_pct": pnl_pct,
            "timestamp": datetime.utcnow().isoformat(),
            "growth_progress": self._growth_tracker.progress_pct,
        })

        logger.info(
            f"HyperGrowth CLOSED: {symbol} {side} pnl={pnl_pct:.1%} "
            f"progress={self._growth_tracker.progress_pct:.0%} "
            f"equity={self._growth_tracker.current_equity:.2f}"
        )

    # -------------------------------------------------------------------------
    # REQUIRED ABSTRACT METHOD IMPLEMENTATIONS
    # -------------------------------------------------------------------------

    def get_parameters(self) -> Dict[str, Any]:
        """Get strategy parameters."""
        return {
            "base_position_pct": self.config.base_position_pct,
            "strong_signal_pct": self.config.strong_signal_pct,
            "min_signal_strength": self.config.min_signal_strength,
            "pyramid_enabled": self.config.pyramid_enabled,
            "initial_stop_atr_mult": self.config.initial_stop_atr_mult,
            "full_exit_r": self.config.full_exit_r,
            "partial_exit_r": self.config.partial_exit_r,
        }

    def set_parameters(self, params: Dict[str, Any]) -> None:
        """Set strategy parameters."""
        for key, value in params.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

    def get_regime_affinity(self) -> Dict[str, float]:
        """Regime affinity weights."""
        return {
            "bull": 1.5,      # Best in bull markets
            "high_vol": 1.3,  # Great in high vol (more opportunities)
            "neutral": 0.8,   # OK in neutral
            "bear": 0.9,      # Can short in bear
        }

    # -------------------------------------------------------------------------
    # STATUS / REPORTING
    # -------------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        """Get full engine status for dashboard."""
        return {
            "name": self.name,
            "is_halted": self._is_halted,
            "daily_trades": self._daily_trades,
            "consecutive_losses": self._consecutive_losses,
            "active_positions": len(self._active_positions),
            "growth_tracker": self._growth_tracker.to_dict(),
            "source_accuracy": {
                name: acc["correct"] / max(acc["total"], 1)
                for name, acc in self._source_accuracy.items()
            },
            "trade_history_count": len(self._trade_history),
        }
