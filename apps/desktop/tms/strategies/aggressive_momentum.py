"""
TradeMaster Supreme - Aggressive Momentum / Breakout Strategy

Designed for maximum capital growth on small accounts.
Targets high-volatility, high-momentum assets including:
- Crypto (BTC, ETH, DOGE, SHIB, SOL, PEPE, WIF, BONK)
- High-beta meme-adjacent stocks (GME, AMC, MSTR, COIN, HOOD)
- Momentum breakouts on volume surges
- Gap-and-go setups at open

Risk profile: MAXIMUM AGGRESSION
- Full Kelly position sizing (not quarter-Kelly)
- 3:1 to 10:1 reward-to-risk targets
- Pyramid into winners (add to winning positions)
- Cut losers fast (tight stops, 1-2% max loss per trade)
- No position size throttling until 40% drawdown

This mode is designed to turn $100 -> $500 -> $2,500 -> $30,000
It will also lose accounts faster than conservative mode.
Use only capital you can afford to lose entirely.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time
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


# High-volatility target universe -- these move 5-30% in a day regularly
CRYPTO_TARGETS = [
    "BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD",
    "SHIB/USD", "PEPE/USD", "WIF/USD", "BONK/USD",
    "AVAX/USD", "MATIC/USD", "LINK/USD", "ARB/USD",
]

MEME_STOCK_TARGETS = [
    "GME", "AMC", "MSTR", "COIN", "HOOD",
    "NVDA", "TSLA", "PLTR", "RIVN", "LCID",
    "SOXL", "TQQQ", "SPXL", "UPRO", "LABU",  # 3x leveraged ETFs
]

# Combined high-volatility universe
HIGH_VOL_UNIVERSE = CRYPTO_TARGETS + MEME_STOCK_TARGETS


@dataclass
class AggressiveMomentumConfig:
    """
    Configuration for maximum-aggression momentum trading.
    
    These settings are tuned for explosive growth on small accounts.
    """
    # --- POSITION SIZING (AGGRESSIVE) ---
    # Full Kelly, not quarter-Kelly. 4x the normal size.
    kelly_fraction: float = 1.0          # Full Kelly
    max_position_pct: float = 0.40       # Up to 40% of account per trade
    min_position_pct: float = 0.10       # Minimum 10% -- no tiny bets
    
    # Pyramid into winners: add more when trade is profitable
    pyramid_enabled: bool = True
    pyramid_add_at_pct_gain: float = 0.03   # Add at +3% gain
    pyramid_max_adds: int = 3               # Max 3 pyramid adds
    pyramid_add_size_pct: float = 0.15      # Each add = 15% of account
    
    # --- ENTRY SIGNALS ---
    # Breakout detection
    breakout_lookback: int = 20          # 20-bar high/low for breakout
    breakout_volume_multiplier: float = 1.5  # Volume must be 1.5x average
    
    # Momentum thresholds
    fast_ema: int = 5                    # 5-bar EMA
    slow_ema: int = 13                   # 13-bar EMA
    rsi_period: int = 7                  # Short RSI for fast signals
    rsi_oversold: float = 30.0           # RSI oversold (buy dip)
    rsi_overbought: float = 70.0         # RSI overbought (short squeeze)
    
    # VWAP deviation for mean-reversion entries
    vwap_deviation_entry: float = 0.015  # Enter when 1.5% from VWAP
    
    # Minimum signal strength to trade
    min_signal_strength: float = 0.35   # Lower bar = more trades
    
    # --- EXIT / STOP LOSS ---
    # Tight stops to preserve capital for next trade
    stop_loss_atr_multiplier: float = 1.0    # 1x ATR stop (tight)
    stop_loss_pct_hard: float = 0.025        # Hard 2.5% stop no matter what
    
    # Aggressive profit targets
    take_profit_r_multiple: float = 5.0      # Target 5R (5x the risk)
    trailing_stop_activation_r: float = 2.0  # Activate trailing at 2R profit
    trailing_stop_atr_multiplier: float = 1.5
    
    # Let winners run -- only exit on momentum reversal or target hit
    exit_on_momentum_reversal: bool = True
    momentum_reversal_bars: int = 3          # 3 bars of reversal = exit
    
    # --- TRADE FREQUENCY ---
    max_trades_per_day: int = 50         # High frequency
    max_concurrent_positions: int = 5    # Up to 5 positions at once
    
    # --- TIMING ---
    # Best times for explosive moves
    trade_open_gap_minutes: int = 15     # Wait 15 min after open for gap-and-go
    trade_power_hour: bool = True        # Extra aggression in last hour
    
    # --- RISK LIMITS (LOOSE) ---
    # Only halt if catastrophic loss
    daily_loss_halt_pct: float = 0.40   # Halt only at 40% daily loss
    max_drawdown_halt_pct: float = 0.50 # Halt at 50% drawdown
    
    # ATR period for volatility measurement
    atr_period: int = 7


class AggressiveMomentumStrategy(BaseStrategy):
    """
    Aggressive Momentum / Breakout Strategy.
    
    This is the "get rich or go home" mode.
    
    Entry logic (in priority order):
    1. BREAKOUT: Price breaks 20-bar high on 1.5x+ volume -> LONG
    2. BREAKOUT: Price breaks 20-bar low on 1.5x+ volume -> SHORT
    3. MOMENTUM: Fast EMA crosses above slow EMA + RSI rising -> LONG
    4. MOMENTUM: Fast EMA crosses below slow EMA + RSI falling -> SHORT
    5. DIP BUY: RSI < 30 in uptrend (price above 50 EMA) -> LONG
    6. SQUEEZE: RSI > 70 in downtrend -> SHORT
    
    Exit logic:
    - Stop loss: 1x ATR or 2.5% hard stop (whichever is tighter)
    - Take profit: 5R target
    - Trailing stop: Activates at 2R, trails 1.5x ATR
    - Momentum reversal: 3 consecutive bars against position
    
    Position sizing:
    - Full Kelly criterion (not fractional)
    - 10-40% of account per trade
    - Pyramid adds on winning trades
    """
    
    def __init__(
        self,
        config: Optional[AggressiveMomentumConfig] = None,
        name: str = "AggressiveMomentum",
    ):
        super().__init__(name=name)
        self.config = config or AggressiveMomentumConfig()
        
        # Track active positions for pyramiding
        self._active_positions: Dict[str, Dict[str, Any]] = {}
        self._pyramid_counts: Dict[str, int] = {}
        
        # Performance tracking for Kelly updates
        self._recent_trades: List[Dict[str, Any]] = []
        self._win_count: int = 0
        self._loss_count: int = 0
        self._total_win_pct: float = 0.0
        self._total_loss_pct: float = 0.0
        
        # Daily trade counter
        self._daily_trades: int = 0
        self._last_trade_date: Optional[str] = None
    
    def _reset_daily_counter(self) -> None:
        """Reset daily trade counter at start of new day."""
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if self._last_trade_date != today:
            self._daily_trades = 0
            self._last_trade_date = today
    
    def _calculate_atr(self, ohlcv: pd.DataFrame, period: int = 7) -> float:
        """Calculate Average True Range."""
        if len(ohlcv) < period + 1:
            return ohlcv["close"].iloc[-1] * 0.02  # Default 2% of price
        
        high = ohlcv["high"]
        low = ohlcv["low"]
        close = ohlcv["close"]
        
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(period).mean().iloc[-1]
        
        return float(atr) if not np.isnan(atr) else ohlcv["close"].iloc[-1] * 0.02
    
    def _calculate_ema(self, series: pd.Series, period: int) -> pd.Series:
        """Calculate Exponential Moving Average."""
        return series.ewm(span=period, adjust=False).mean()
    
    def _calculate_rsi(self, series: pd.Series, period: int = 7) -> float:
        """Calculate RSI."""
        if len(series) < period + 1:
            return 50.0
        
        delta = series.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)
        
        avg_gain = gain.rolling(period).mean().iloc[-1]
        avg_loss = loss.rolling(period).mean().iloc[-1]
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return float(rsi) if not np.isnan(rsi) else 50.0
    
    def _calculate_vwap(self, ohlcv: pd.DataFrame) -> float:
        """Calculate VWAP for the session."""
        if "volume" not in ohlcv.columns or len(ohlcv) == 0:
            return float(ohlcv["close"].iloc[-1])
        
        typical_price = (ohlcv["high"] + ohlcv["low"] + ohlcv["close"]) / 3
        vwap = (typical_price * ohlcv["volume"]).sum() / ohlcv["volume"].sum()
        
        return float(vwap) if not np.isnan(vwap) else float(ohlcv["close"].iloc[-1])
    
    def _detect_breakout(
        self,
        ohlcv: pd.DataFrame,
        lookback: int = 20,
    ) -> Tuple[bool, bool, float]:
        """
        Detect price breakouts above/below N-bar high/low.
        
        Returns:
            (bullish_breakout, bearish_breakout, breakout_strength)
        """
        if len(ohlcv) < lookback + 1:
            return False, False, 0.0
        
        current_close = ohlcv["close"].iloc[-1]
        current_volume = ohlcv["volume"].iloc[-1] if "volume" in ohlcv.columns else 1.0
        
        # N-bar high/low (excluding current bar)
        prior_bars = ohlcv.iloc[-(lookback + 1):-1]
        n_bar_high = prior_bars["high"].max()
        n_bar_low = prior_bars["low"].min()
        
        # Volume confirmation
        avg_volume = prior_bars["volume"].mean() if "volume" in ohlcv.columns else 1.0
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0
        volume_confirmed = volume_ratio >= self.config.breakout_volume_multiplier
        
        # Breakout detection
        bullish_breakout = (
            current_close > n_bar_high and volume_confirmed
        )
        bearish_breakout = (
            current_close < n_bar_low and volume_confirmed
        )
        
        # Strength = how far above/below the breakout level
        if bullish_breakout and n_bar_high > 0:
            strength = min(1.0, (current_close - n_bar_high) / n_bar_high * 20)
        elif bearish_breakout and n_bar_low > 0:
            strength = min(1.0, (n_bar_low - current_close) / n_bar_low * 20)
        else:
            strength = 0.0
        
        # Boost strength by volume ratio
        strength = min(1.0, strength * (1 + (volume_ratio - 1) * 0.5))
        
        return bullish_breakout, bearish_breakout, strength
    
    def _get_kelly_position_size(self, equity: float) -> float:
        """
        Calculate position size using full Kelly criterion.
        
        Uses recent trade history to estimate win rate and win/loss ratio.
        Falls back to max_position_pct if insufficient history.
        """
        if len(self._recent_trades) < 5:
            # Not enough history -- use aggressive default
            return self.config.max_position_pct * 0.5
        
        wins = [t for t in self._recent_trades if t["pnl_pct"] > 0]
        losses = [t for t in self._recent_trades if t["pnl_pct"] <= 0]
        
        if not wins or not losses:
            return self.config.max_position_pct * 0.5
        
        win_rate = len(wins) / len(self._recent_trades)
        avg_win = np.mean([t["pnl_pct"] for t in wins])
        avg_loss = abs(np.mean([t["pnl_pct"] for t in losses]))
        
        if avg_loss == 0:
            return self.config.max_position_pct
        
        win_loss_ratio = avg_win / avg_loss
        
        # Full Kelly: f* = (p * b - q) / b
        p = win_rate
        q = 1 - p
        b = win_loss_ratio
        
        kelly = (p * b - q) / b if b > 0 else 0.0
        kelly = max(0.0, kelly) * self.config.kelly_fraction
        
        # Clamp to configured bounds
        kelly = max(self.config.min_position_pct, min(self.config.max_position_pct, kelly))
        
        return kelly
    
    def generate_signal(self, market_state: MarketState) -> Optional[Signal]:
        """
        Generate aggressive trading signal.
        
        Checks (in order):
        1. Breakout above N-bar high (LONG)
        2. Breakout below N-bar low (SHORT)
        3. EMA crossover with RSI confirmation (LONG/SHORT)
        4. RSI dip buy in uptrend (LONG)
        5. RSI squeeze in downtrend (SHORT)
        """
        self._reset_daily_counter()
        
        # Daily trade limit check
        if self._daily_trades >= self.config.max_trades_per_day:
            return None
        
        ohlcv = market_state.ohlcv
        symbol = market_state.symbol
        
        if ohlcv is None or len(ohlcv) < 20:
            return None
        
        current_price = market_state.current_price or float(ohlcv["close"].iloc[-1])
        
        # --- COMPUTE INDICATORS ---
        close = ohlcv["close"]
        
        fast_ema = self._calculate_ema(close, self.config.fast_ema)
        slow_ema = self._calculate_ema(close, self.config.slow_ema)
        ema_50 = self._calculate_ema(close, 50)
        rsi = self._calculate_rsi(close, self.config.rsi_period)
        atr = self._calculate_atr(ohlcv, self.config.atr_period)
        vwap = self._calculate_vwap(ohlcv)
        
        fast_now = float(fast_ema.iloc[-1])
        fast_prev = float(fast_ema.iloc[-2]) if len(fast_ema) > 1 else fast_now
        slow_now = float(slow_ema.iloc[-1])
        slow_prev = float(slow_ema.iloc[-2]) if len(slow_ema) > 1 else slow_now
        ema50_now = float(ema_50.iloc[-1])
        
        # EMA crossover detection
        bullish_cross = fast_prev <= slow_prev and fast_now > slow_now
        bearish_cross = fast_prev >= slow_prev and fast_now < slow_now
        
        # Trend direction
        in_uptrend = current_price > ema50_now
        in_downtrend = current_price < ema50_now
        
        # VWAP deviation
        vwap_dev = (current_price - vwap) / vwap if vwap > 0 else 0.0
        
        # --- SIGNAL GENERATION ---
        signal_type = None
        signal_strength = 0.0
        signal_reason = ""
        
        # 1. BREAKOUT SIGNALS (highest priority)
        bull_break, bear_break, break_strength = self._detect_breakout(
            ohlcv, self.config.breakout_lookback
        )
        
        if bull_break and break_strength > 0.1:
            signal_type = SignalType.LONG
            signal_strength = min(1.0, 0.6 + break_strength * 0.4)
            signal_reason = f"BREAKOUT_LONG strength={break_strength:.2f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        elif bear_break and break_strength > 0.1:
            signal_type = SignalType.SHORT
            signal_strength = min(1.0, 0.6 + break_strength * 0.4)
            signal_reason = f"BREAKOUT_SHORT strength={break_strength:.2f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        # 2. EMA CROSSOVER SIGNALS
        elif bullish_cross and rsi < 65:
            signal_type = SignalType.LONG
            signal_strength = 0.55 + (0.1 if in_uptrend else 0.0) + (0.05 if rsi < 50 else 0.0)
            signal_reason = f"EMA_CROSS_LONG rsi={rsi:.1f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        elif bearish_cross and rsi > 35:
            signal_type = SignalType.SHORT
            signal_strength = 0.55 + (0.1 if in_downtrend else 0.0) + (0.05 if rsi > 50 else 0.0)
            signal_reason = f"EMA_CROSS_SHORT rsi={rsi:.1f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        # 3. RSI DIP BUY (buy the dip in uptrend)
        elif rsi <= self.config.rsi_oversold and in_uptrend:
            signal_type = SignalType.LONG
            signal_strength = 0.50 + (self.config.rsi_oversold - rsi) / 100
            signal_reason = f"RSI_DIP_BUY rsi={rsi:.1f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        # 4. RSI SQUEEZE SHORT (short the squeeze in downtrend)
        elif rsi >= self.config.rsi_overbought and in_downtrend:
            signal_type = SignalType.SHORT
            signal_strength = 0.50 + (rsi - self.config.rsi_overbought) / 100
            signal_reason = f"RSI_SQUEEZE_SHORT rsi={rsi:.1f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        # 5. VWAP DEVIATION LONG (price pulled far below VWAP in uptrend)
        elif vwap_dev < -self.config.vwap_deviation_entry and in_uptrend and rsi < 45:
            signal_type = SignalType.LONG
            signal_strength = 0.45 + min(0.3, abs(vwap_dev) * 10)
            signal_reason = f"VWAP_DEVIATION_LONG dev={vwap_dev:.3f}"
            logger.info(f"{symbol}: {signal_reason}")
        
        # No signal
        if signal_type is None or signal_strength < self.config.min_signal_strength:
            return None
        
        # --- CALCULATE STOPS AND TARGETS ---
        stop_distance_atr = atr * self.config.stop_loss_atr_multiplier
        stop_distance_pct = current_price * self.config.stop_loss_pct_hard
        
        # Use tighter of ATR stop or hard % stop
        stop_distance = min(stop_distance_atr, stop_distance_pct)
        
        if signal_type == SignalType.LONG:
            stop_loss = current_price - stop_distance
            take_profit = current_price + (stop_distance * self.config.take_profit_r_multiple)
        else:
            stop_loss = current_price + stop_distance
            take_profit = current_price - (stop_distance * self.config.take_profit_r_multiple)
        
        # --- BUILD SIGNAL ---
        self._daily_trades += 1
        
        return Signal(
            symbol=symbol,
            signal_type=signal_type,
            strength=signal_strength,
            strategy_name=self.name,
            timestamp=datetime.utcnow(),
            target_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            order_type=OrderType.MARKET,
            metadata={
                "reason": signal_reason,
                "rsi": rsi,
                "atr": atr,
                "vwap": vwap,
                "vwap_deviation": vwap_dev,
                "fast_ema": fast_now,
                "slow_ema": slow_now,
                "in_uptrend": in_uptrend,
                "stop_distance": stop_distance,
                "risk_reward": self.config.take_profit_r_multiple,
                "kelly_size_pct": self._get_kelly_position_size(100),  # normalized
                "mode": "AGGRESSIVE",
            },
        )
    
    def record_trade_result(self, pnl_pct: float, symbol: str = "") -> None:
        """
        Record trade result for Kelly criterion updates.
        
        Call this after each trade closes.
        """
        self._recent_trades.append({
            "timestamp": datetime.utcnow().isoformat(),
            "symbol": symbol,
            "pnl_pct": pnl_pct,
        })
        
        # Keep last 50 trades for Kelly calculation
        if len(self._recent_trades) > 50:
            self._recent_trades.pop(0)
        
        if pnl_pct > 0:
            self._win_count += 1
            self._total_win_pct += pnl_pct
        else:
            self._loss_count += 1
            self._total_loss_pct += abs(pnl_pct)
        
        total = self._win_count + self._loss_count
        win_rate = self._win_count / total if total > 0 else 0.5
        avg_win = self._total_win_pct / self._win_count if self._win_count > 0 else 0.0
        avg_loss = self._total_loss_pct / self._loss_count if self._loss_count > 0 else 0.0
        
        logger.info(
            f"AggressiveMomentum trade recorded: pnl={pnl_pct:.2%} | "
            f"win_rate={win_rate:.1%} | avg_win={avg_win:.2%} | avg_loss={avg_loss:.2%} | "
            f"total_trades={total}"
        )
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get current performance statistics."""
        total = self._win_count + self._loss_count
        win_rate = self._win_count / total if total > 0 else 0.0
        avg_win = self._total_win_pct / self._win_count if self._win_count > 0 else 0.0
        avg_loss = self._total_loss_pct / self._loss_count if self._loss_count > 0 else 0.0
        
        return {
            "total_trades": total,
            "win_count": self._win_count,
            "loss_count": self._loss_count,
            "win_rate": win_rate,
            "avg_win_pct": avg_win,
            "avg_loss_pct": avg_loss,
            "profit_factor": (avg_win * self._win_count) / (avg_loss * self._loss_count)
            if self._loss_count > 0 and avg_loss > 0 else 0.0,
            "kelly_size_pct": self._get_kelly_position_size(100),
            "daily_trades": self._daily_trades,
        }
    
    def analyze(self, market_state: MarketState) -> Optional[Signal]:
        """Alias for generate_signal -- required by BaseStrategy."""
        return self.generate_signal(market_state)
