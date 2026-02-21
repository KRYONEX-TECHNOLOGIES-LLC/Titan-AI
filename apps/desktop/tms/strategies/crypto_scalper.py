"""
TradeMaster Supreme - Crypto Scalper / Meme Coin Hunter

Specialized strategy for crypto and high-volatility meme assets.

This is what the kids in their bedrooms are doing:
1. Find coins/tokens with massive volume spikes
2. Buy the breakout when momentum is confirmed
3. Ride the wave with a trailing stop
4. Exit fast when momentum dies
5. Repeat 10-20x per day

Targets:
- Solana ecosystem tokens (SOL, BONK, WIF, POPCAT, etc.)
- Ethereum meme coins (PEPE, SHIB, FLOKI, etc.)
- High-beta crypto (DOGE, XRP during pumps)
- Leveraged crypto ETFs (BITO, MSTR, COIN)

Key insight: Meme coins move on SOCIAL MOMENTUM, not fundamentals.
The signal is: volume spike + price breakout + social buzz = BUY NOW.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
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


# Crypto universe -- sorted by volatility potential (highest first)
CRYPTO_UNIVERSE = {
    # Meme coins -- highest volatility, can 10x in hours
    "meme": [
        "DOGE/USD", "SHIB/USD", "PEPE/USD", "WIF/USD",
        "BONK/USD", "FLOKI/USD", "MEME/USD", "POPCAT/USD",
    ],
    # Mid-cap alts -- high volatility, more liquid
    "alt": [
        "SOL/USD", "AVAX/USD", "MATIC/USD", "LINK/USD",
        "ARB/USD", "OP/USD", "INJ/USD", "TIA/USD",
    ],
    # Large cap -- lower volatility but huge liquidity
    "large": [
        "BTC/USD", "ETH/USD", "BNB/USD", "XRP/USD",
    ],
    # Crypto-adjacent stocks
    "stocks": [
        "MSTR", "COIN", "HOOD", "RIOT", "MARA",
        "CLSK", "BTBT", "HUT",
    ],
}


@dataclass
class CryptoScalperConfig:
    """Configuration for crypto scalping strategy."""
    
    # --- VOLUME SPIKE DETECTION ---
    # The #1 signal for meme coin pumps is volume
    volume_spike_multiplier: float = 3.0    # 3x average volume = signal
    volume_lookback: int = 24               # 24-bar average for baseline
    
    # --- MOMENTUM DETECTION ---
    # Short timeframe momentum for fast entries
    momentum_period: int = 5               # 5-bar momentum
    momentum_threshold: float = 0.02       # 2% move in 5 bars = momentum
    
    # RSI for overbought/oversold
    rsi_period: int = 5                    # Very short RSI
    rsi_buy_threshold: float = 55.0        # Buy when RSI crosses above 55
    rsi_sell_threshold: float = 45.0       # Sell when RSI drops below 45
    
    # --- BREAKOUT DETECTION ---
    breakout_period: int = 10              # 10-bar high for breakout
    breakout_confirmation_bars: int = 1    # 1 bar confirmation
    
    # --- POSITION MANAGEMENT ---
    # Tight stops -- crypto moves fast, cut losses fast
    stop_loss_pct: float = 0.03           # 3% stop loss
    take_profit_pct: float = 0.15         # 15% take profit (5R on 3% stop)
    
    # Trailing stop to lock in gains
    trailing_stop_activation_pct: float = 0.05   # Activate at +5%
    trailing_stop_distance_pct: float = 0.03     # Trail 3% below peak
    
    # --- SIGNAL THRESHOLDS ---
    min_signal_strength: float = 0.40     # Lower bar for more trades
    
    # --- POSITION SIZING ---
    # Aggressive sizing for crypto
    base_position_pct: float = 0.25       # 25% of account per trade
    max_position_pct: float = 0.40        # Max 40% on very strong signals
    
    # Max concurrent crypto positions
    max_positions: int = 3


class CryptoScalper(BaseStrategy):
    """
    Crypto Scalper / Meme Coin Hunter.
    
    Entry signals:
    1. VOLUME SPIKE: Volume 3x+ average -> look for breakout
    2. MOMENTUM BREAKOUT: Price breaks 10-bar high on volume spike
    3. RSI MOMENTUM: RSI crosses 55 from below with rising volume
    4. PUMP DETECTION: 2%+ move in 5 bars with volume confirmation
    
    Exit signals:
    1. Stop loss: 3% hard stop
    2. Take profit: 15% target (5R)
    3. Trailing stop: 3% trail after +5% gain
    4. Momentum death: RSI drops below 45 after being above 60
    
    This strategy is designed to catch the early part of crypto pumps
    and exit before the inevitable dump.
    """
    
    def __init__(
        self,
        config: Optional[CryptoScalperConfig] = None,
        name: str = "CryptoScalper",
    ):
        super().__init__(name=name)
        self.config = config or CryptoScalperConfig()
        
        # Track volume baselines per symbol
        self._volume_baselines: Dict[str, float] = {}
        
        # Track active signals to avoid re-entering
        self._active_signals: Dict[str, datetime] = {}
        
        # Performance
        self._trades: List[Dict[str, Any]] = []
    
    def _calculate_rsi(self, series: pd.Series, period: int = 5) -> float:
        """Fast RSI calculation."""
        if len(series) < period + 1:
            return 50.0
        
        delta = series.diff().dropna()
        gain = delta.where(delta > 0, 0.0).rolling(period).mean().iloc[-1]
        loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean().iloc[-1]
        
        if loss == 0:
            return 100.0
        
        rs = gain / loss
        return float(100 - (100 / (1 + rs)))
    
    def _detect_volume_spike(
        self,
        ohlcv: pd.DataFrame,
        symbol: str,
    ) -> Tuple[bool, float]:
        """
        Detect abnormal volume spike.
        
        Returns (is_spike, spike_ratio)
        """
        if "volume" not in ohlcv.columns or len(ohlcv) < self.config.volume_lookback:
            return False, 1.0
        
        current_vol = float(ohlcv["volume"].iloc[-1])
        
        # Use rolling average excluding current bar
        avg_vol = float(ohlcv["volume"].iloc[-(self.config.volume_lookback + 1):-1].mean())
        
        if avg_vol <= 0:
            return False, 1.0
        
        spike_ratio = current_vol / avg_vol
        is_spike = spike_ratio >= self.config.volume_spike_multiplier
        
        # Cache baseline
        self._volume_baselines[symbol] = avg_vol
        
        return is_spike, spike_ratio
    
    def _detect_momentum(self, ohlcv: pd.DataFrame) -> Tuple[float, str]:
        """
        Detect price momentum.
        
        Returns (momentum_pct, direction)
        """
        if len(ohlcv) < self.config.momentum_period + 1:
            return 0.0, "neutral"
        
        current = float(ohlcv["close"].iloc[-1])
        past = float(ohlcv["close"].iloc[-self.config.momentum_period - 1])
        
        if past <= 0:
            return 0.0, "neutral"
        
        momentum_pct = (current - past) / past
        
        if momentum_pct >= self.config.momentum_threshold:
            return momentum_pct, "bullish"
        elif momentum_pct <= -self.config.momentum_threshold:
            return momentum_pct, "bearish"
        else:
            return momentum_pct, "neutral"
    
    def _detect_breakout(self, ohlcv: pd.DataFrame) -> Tuple[bool, bool]:
        """Detect N-bar high/low breakout."""
        if len(ohlcv) < self.config.breakout_period + 1:
            return False, False
        
        current_close = float(ohlcv["close"].iloc[-1])
        prior = ohlcv.iloc[-(self.config.breakout_period + 1):-1]
        
        n_bar_high = float(prior["high"].max())
        n_bar_low = float(prior["low"].min())
        
        bull_break = current_close > n_bar_high
        bear_break = current_close < n_bar_low
        
        return bull_break, bear_break
    
    def generate_signal(self, market_state: MarketState) -> Optional[Signal]:
        """
        Generate crypto scalping signal.
        
        Priority:
        1. Volume spike + breakout = strongest signal
        2. Volume spike + momentum = strong signal
        3. Breakout alone = moderate signal
        4. Momentum alone = weak signal (only if RSI confirms)
        """
        ohlcv = market_state.ohlcv
        symbol = market_state.symbol
        
        if ohlcv is None or len(ohlcv) < 15:
            return None
        
        current_price = market_state.current_price or float(ohlcv["close"].iloc[-1])
        close = ohlcv["close"]
        
        # --- COMPUTE ALL SIGNALS ---
        is_vol_spike, vol_ratio = self._detect_volume_spike(ohlcv, symbol)
        momentum_pct, momentum_dir = self._detect_momentum(ohlcv)
        bull_break, bear_break = self._detect_breakout(ohlcv)
        rsi = self._calculate_rsi(close, self.config.rsi_period)
        
        # --- SIGNAL SCORING ---
        long_score = 0.0
        short_score = 0.0
        signal_reasons = []
        
        # Volume spike is the multiplier -- everything is stronger with volume
        vol_multiplier = min(2.0, 1.0 + (vol_ratio - 1) * 0.3) if is_vol_spike else 1.0
        
        # Breakout signals
        if bull_break:
            long_score += 0.35 * vol_multiplier
            signal_reasons.append(f"BREAKOUT_HIGH vol_ratio={vol_ratio:.1f}x")
        
        if bear_break:
            short_score += 0.35 * vol_multiplier
            signal_reasons.append(f"BREAKOUT_LOW vol_ratio={vol_ratio:.1f}x")
        
        # Momentum signals
        if momentum_dir == "bullish":
            long_score += 0.25 * vol_multiplier
            signal_reasons.append(f"MOMENTUM+{momentum_pct:.1%}")
        elif momentum_dir == "bearish":
            short_score += 0.25 * vol_multiplier
            signal_reasons.append(f"MOMENTUM{momentum_pct:.1%}")
        
        # RSI confirmation
        if rsi > self.config.rsi_buy_threshold:
            long_score += 0.15
            signal_reasons.append(f"RSI_BULL={rsi:.0f}")
        elif rsi < self.config.rsi_sell_threshold:
            short_score += 0.15
            signal_reasons.append(f"RSI_BEAR={rsi:.0f}")
        
        # Volume spike alone adds score
        if is_vol_spike:
            long_score += 0.10 if momentum_dir != "bearish" else 0.0
            short_score += 0.10 if momentum_dir == "bearish" else 0.0
            signal_reasons.append(f"VOL_SPIKE={vol_ratio:.1f}x")
        
        # --- DETERMINE SIGNAL ---
        signal_type = None
        signal_strength = 0.0
        
        if long_score > short_score and long_score >= self.config.min_signal_strength:
            signal_type = SignalType.LONG
            signal_strength = min(1.0, long_score)
        elif short_score > long_score and short_score >= self.config.min_signal_strength:
            signal_type = SignalType.SHORT
            signal_strength = min(1.0, short_score)
        
        if signal_type is None:
            return None
        
        # --- CALCULATE STOPS ---
        stop_distance = current_price * self.config.stop_loss_pct
        target_distance = current_price * self.config.take_profit_pct
        
        if signal_type == SignalType.LONG:
            stop_loss = current_price - stop_distance
            take_profit = current_price + target_distance
        else:
            stop_loss = current_price + stop_distance
            take_profit = current_price - target_distance
        
        # Position size scales with signal strength
        position_pct = self.config.base_position_pct + (
            (self.config.max_position_pct - self.config.base_position_pct) * signal_strength
        )
        
        logger.info(
            f"CryptoScalper {symbol}: {signal_type.value.upper()} "
            f"strength={signal_strength:.2f} | {' | '.join(signal_reasons)}"
        )
        
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
                "reasons": signal_reasons,
                "volume_ratio": vol_ratio,
                "is_volume_spike": is_vol_spike,
                "momentum_pct": momentum_pct,
                "rsi": rsi,
                "long_score": long_score,
                "short_score": short_score,
                "position_pct": position_pct,
                "stop_loss_pct": self.config.stop_loss_pct,
                "take_profit_pct": self.config.take_profit_pct,
                "risk_reward": self.config.take_profit_pct / self.config.stop_loss_pct,
                "mode": "CRYPTO_SCALP",
            },
        )
    
    def analyze(self, market_state: MarketState) -> Optional[Signal]:
        """Required by BaseStrategy."""
        return self.generate_signal(market_state)
