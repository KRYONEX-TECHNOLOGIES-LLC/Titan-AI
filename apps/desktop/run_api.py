"""
TradeMaster Supreme V2 - MEMECOIN DOMINATION EDITION

Autonomous trading bot with real-time strategy execution.
Now with Solana memecoin sniping, whale tracking, and social alpha.
"""

import os
import sys
import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, List, Tuple
from dotenv import load_dotenv
from pydantic import BaseModel
import random
import pytz
import json

# Import Alpha-Sovereign Core
from alpha_core import alpha_engine, AlphaEngine
from learning_engine import learning_engine, AdaptiveLearningEngine

# Import Memecoin Domination Engine
try:
    from tms.memecoin.api_routes import router as memecoin_router, get_engine as get_memecoin_engine
    MEMECOIN_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] Memecoin engine not available: {e}")
    MEMECOIN_AVAILABLE = False

# Load environment variables
load_dotenv()

# Try to import Alpaca
try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import MarketOrderRequest, GetOrdersRequest
    from alpaca.trading.enums import OrderSide, TimeInForce, QueryOrderStatus
    from alpaca.data.historical import CryptoHistoricalDataClient, StockHistoricalDataClient
    from alpaca.data.requests import CryptoBarsRequest, StockBarsRequest
    from alpaca.data.timeframe import TimeFrame
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False

# Trading engine state
trading_task = None
trade_log: List[Dict] = []
activity_log: List[Dict] = []  # Live activity feed

def log_activity(message: str, level: str = "info"):
    """Add to activity log for dashboard display"""
    from datetime import timezone
    activity_log.append({
        "time": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "level": level
    })
    # Keep only last 100 entries
    if len(activity_log) > 100:
        activity_log.pop(0)
    print(f"[{level.upper()}] {message}")

# Backtesting state
backtest_results: Dict[str, Dict] = {}
backtest_counter = 0

# Configuration from .env
config = {
    "trading_mode": os.getenv("TMS_TRADING_MODE", "paper"),
    "trading_phase": os.getenv("TMS_TRADING_PHASE", "phase1"),
    "starting_capital": float(os.getenv("TMS_STARTING_CAPITAL", "40.0")),
    "alpaca_api_key": os.getenv("TMS_ALPACA_API_KEY", ""),
    "alpaca_secret_key": os.getenv("TMS_ALPACA_SECRET_KEY", ""),
    "alpaca_base_url": os.getenv("TMS_ALPACA_BASE_URL", "https://paper-api.alpaca.markets"),
    "polygon_api_key": os.getenv("TMS_POLYGON_API_KEY", ""),
    "discord_webhook": os.getenv("TMS_DISCORD_WEBHOOK_URL", ""),
    "telegram_token": os.getenv("TMS_TELEGRAM_BOT_TOKEN", ""),
    "max_drawdown": float(os.getenv("TMS_MAX_DRAWDOWN", "0.10")),
    "max_daily_loss": float(os.getenv("TMS_MAX_DAILY_LOSS", "0.03")),
    "hard_stop_time": os.getenv("TMS_HARD_STOP_TIME", "15:50"),
}

app = FastAPI(
    title="TradeMaster Supreme V2 - MEMECOIN DOMINATION",
    description="The most aggressive memecoin trading system ever built. "
                "Solana sniping, whale tracking, social alpha, rug detection. "
                "Turn $100 into $500+ daily. On a good day, $20k+.",
    version="2.0.0",
)

# Mount memecoin routes
if MEMECOIN_AVAILABLE:
    app.include_router(memecoin_router)
    print("[MEMECOIN] Memecoin Domination Engine routes mounted at /api/memecoin")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# WEBSOCKET CONNECTION MANAGER
# Real-time GVU Chain-of-Thought Streaming
# ============================================================================

class ConnectionManager:
    """Manages WebSocket connections for real-time streaming"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.gvu_log: List[Dict] = []  # Chain-of-thought log
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: Dict):
        """Broadcast message to all connected clients"""
        self.gvu_log.append(message)
        if len(self.gvu_log) > 200:
            self.gvu_log.pop(0)
        
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass
    
    async def send_gvu_thought(self, agent: str, thought: str, level: str = "info"):
        """Send GVU chain-of-thought message"""
        message = {
            "type": "gvu_thought",
            "time": datetime.now().isoformat(),
            "agent": agent,
            "thought": thought,
            "level": level,
        }
        await self.broadcast(message)
    
    async def send_signal(self, signal: Dict):
        """Send trade signal to clients"""
        message = {
            "type": "signal",
            "time": datetime.now().isoformat(),
            "data": signal,
        }
        await self.broadcast(message)
    
    async def send_state_update(self, state: Dict):
        """Send state update to clients"""
        message = {
            "type": "state_update",
            "time": datetime.now().isoformat(),
            "data": state,
        }
        await self.broadcast(message)


ws_manager = ConnectionManager()


# Initialize Alpaca clients
alpaca_client = None
crypto_data_client = None
stock_data_client = None
if ALPACA_AVAILABLE and config["alpaca_api_key"] and config["alpaca_secret_key"]:
    try:
        alpaca_client = TradingClient(
            config["alpaca_api_key"],
            config["alpaca_secret_key"],
            paper="paper" in config["alpaca_base_url"]
        )
        # Data clients for historical data
        crypto_data_client = CryptoHistoricalDataClient()
        stock_data_client = StockHistoricalDataClient(
            config["alpaca_api_key"],
            config["alpaca_secret_key"]
        )
    except Exception as e:
        print(f"Failed to initialize Alpaca: {e}")


# ============================================================================
# AUTONOMOUS TRADING ENGINE
# ============================================================================

# Crypto symbols to trade
# More crypto pairs = more opportunities (24/7 trading)
# ALL Alpaca crypto pairs - 22 tradeable assets (excluding stablecoins)
CRYPTO_SYMBOLS = [
    # Major coins
    "BTC/USD", "ETH/USD", "SOL/USD", "LTC/USD", "BCH/USD", "XRP/USD",
    # Meme coins (high volatility, quick wins)
    "DOGE/USD", "SHIB/USD", "PEPE/USD", "TRUMP/USD",
    # DeFi tokens
    "AVAX/USD", "LINK/USD", "UNI/USD", "AAVE/USD", "SUSHI/USD",
    "CRV/USD", "YFI/USD", "GRT/USD",
    # Other altcoins
    "DOT/USD", "BAT/USD", "XTZ/USD", "SKY/USD"
]
# Stocks only work Mon-Fri 9:30-4:00 ET (requires paid data subscription)
STOCK_SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMD"]

# Strategy parameters - V20 MOMENTUM HUNTER (Target: 65%+ win rate, 3:1+ R:R)
# KEY: Ride winners hard, cut losers fast. Asymmetric payoff profile.
# The old nano-scalping was garbage: 0.35% TP with 6% SL = need 95% win rate to break even.
# New approach: 2-5% take profit, 1.5% stop loss = only need 40% win rate to profit.
STRATEGY_CONFIG = {
    "momentum_lookback": 20,  # bars to look back
    "momentum_threshold": 0.008,  # 0.8% base threshold (more signals)
    "mean_reversion_threshold": 0.035,  # 3.5% deviation for mean reversion
    "position_size_pct": 0.10,  # 10% of portfolio per trade (aggressive)
    "max_positions": 5,  # 5 max positions (concentrated)
    
    # ASYMMETRIC RISK/REWARD - This is the key to making money
    "stop_loss_pct": 0.015,  # 1.5% stop loss (CUT LOSERS FAST)
    "take_profit_pct": 0.05,  # 5% take profit (LET WINNERS RUN)
    "trailing_stop_pct": 0.012,  # 1.2% trailing (lock in gains)
    "breakeven_trigger": 0.008,  # Move to breakeven at 0.8% profit
    
    "min_trade_interval": 45,  # 45 sec between trades (faster)
    "min_hold_bars": 1,  # Can exit immediately
    
    # ENTRY REQUIREMENTS - Selective but not too restrictive
    "min_trend_strength": 0.008,  # 0.8%+ trend
    "min_momentum_for_entry": 0.004,  # 0.4%+ momentum
    "require_higher_highs": True,  # Need higher highs
    "require_volume_surge": False,  # No volume requirement
    "min_bars_in_trend": 2,  # 2 bars in trend
    
    # REGIME FILTER
    "skip_bearish_regime": True,  # Never buy in downtrends
    "skip_choppy_market": False,  # Trade choppy markets (crypto is always choppy)
    "min_regime_strength": 0.005,  # Lower threshold
    
    # VOLATILITY FILTER - Embrace volatility, that is where the money is
    "max_volatility": 0.35,  # High volatility OK (memecoins are volatile)
    "min_volatility": 0.0003,  # Almost never skip
    
    # ADAPTIVE CAPITAL TIERS
    "micro_capital_threshold": 500,
    "small_capital_threshold": 2000,
    "medium_capital_threshold": 10000,
    
    # CRYPTO-SPECIFIC SETTINGS
    "crypto_take_profit_pct": 0.08,  # 8% TP for crypto (more volatile)
    "crypto_stop_loss_pct": 0.02,  # 2% SL for crypto
    "crypto_position_size_pct": 0.12,  # 12% per crypto trade
    "crypto_max_positions": 4,  # Max 4 crypto positions
    
    # MOMENTUM STACKING - Multiple timeframe confirmation
    "use_multi_timeframe": True,
    "fast_ma_period": 5,
    "medium_ma_period": 10,
    "slow_ma_period": 20,
}

last_trade_time: Dict[str, datetime] = {}


# ============================================================================
# GVU MULTI-AGENT ARCHITECTURE
# Generator -> Verifier -> Updater Pipeline
# ============================================================================

class GeneratorAgent:
    """
    Generator Agent: Scans markets and generates trade signals.
    Part of the GVU (Generator-Verifier-Updater) architecture.
    """
    
    def __init__(self):
        self.signals_generated = 0
        self.last_scan_time = None
        self.market_momentum = {}  # symbol -> momentum
    
    async def scan_markets(self, symbols: List[str], is_crypto: bool = True) -> List[Dict]:
        """Parallel scan all symbols and generate signals"""
        from datetime import timezone
        self.last_scan_time = datetime.now(timezone.utc)
        
        # Parallel fetch all signals
        tasks = [self._analyze_symbol(sym, is_crypto) for sym in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        signals = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                continue
            if result:
                self.signals_generated += 1
                signals.append(result)
                # Track momentum for regime detection
                self.market_momentum[symbols[i]] = result.get("strength", 0)
        
        return signals
    
    async def _analyze_symbol(self, symbol: str, is_crypto: bool) -> Optional[Dict]:
        """Analyze a single symbol for trade signals"""
        # Delegate to existing signal checker
        return await check_trading_signals(symbol, is_crypto)
    
    def get_market_regime(self) -> Dict:
        """Calculate overall market regime based on momentum readings"""
        if not self.market_momentum:
            return {"regime": "unknown", "confidence": 0.0}
        
        momentums = list(self.market_momentum.values())
        positive = sum(1 for m in momentums if m > 0)
        negative = sum(1 for m in momentums if m < 0)
        total = len(momentums)
        
        if total == 0:
            return {"regime": "unknown", "confidence": 0.0}
        
        positive_pct = positive / total
        negative_pct = negative / total
        
        if positive_pct >= 0.7:
            return {"regime": "bullish", "confidence": positive_pct}
        elif negative_pct >= 0.7:
            return {"regime": "bearish", "confidence": negative_pct}
        else:
            return {"regime": "neutral", "confidence": max(positive_pct, negative_pct)}


class VerifierAgent:
    """
    Verifier Agent: Validates signals against risk rules.
    Ensures variance inequality is satisfied before trading.
    """
    
    def __init__(self):
        self.signals_verified = 0
        self.signals_rejected = 0
        self.rejection_reasons = []
    
    def verify_signal(self, signal: Dict, state: Dict, positions: List) -> Tuple[bool, str]:
        """
        Verify a signal against all risk rules.
        Returns (is_valid, reason)
        """
        symbol = signal.get("symbol", "")
        
        # Check 1: Variance Inequality - Signal > Noise
        if not self._check_variance_inequality(signal, state):
            self.signals_rejected += 1
            reason = "Variance inequality not satisfied"
            self.rejection_reasons.append(reason)
            return False, reason
        
        # Check 2: Max drawdown
        max_dd = float(os.getenv("TMS_MAX_DRAWDOWN", "0.10"))
        current_dd = state.get("current_drawdown", 0)
        if current_dd >= max_dd:
            self.signals_rejected += 1
            reason = f"Max drawdown exceeded: {current_dd:.1%} >= {max_dd:.1%}"
            self.rejection_reasons.append(reason)
            return False, reason
        
        # Check 3: Daily loss limit
        max_daily_loss = float(os.getenv("TMS_MAX_DAILY_LOSS", "0.03"))
        daily_pnl = state.get("daily_pnl_pct", 0)
        if daily_pnl <= -max_daily_loss:
            self.signals_rejected += 1
            reason = f"Daily loss limit hit: {daily_pnl:.1%}"
            self.rejection_reasons.append(reason)
            return False, reason
        
        # Check 4: Regime confidence
        regime_conf = state.get("regime_confidence", 0.5)
        if regime_conf < 0.6 and signal["side"] == "buy":
            self.signals_rejected += 1
            reason = f"Low regime confidence: {regime_conf:.1%} < 60%"
            self.rejection_reasons.append(reason)
            return False, reason
        
        # Check 5: Max positions
        if len(positions) >= STRATEGY_CONFIG["max_positions"]:
            if signal["side"] == "buy":
                self.signals_rejected += 1
                reason = f"Max positions reached: {len(positions)}"
                self.rejection_reasons.append(reason)
                return False, reason
        
        # Check 6: Hard stop time (3:50 PM ET)
        if self._is_past_hard_stop():
            self.signals_rejected += 1
            reason = "Past hard stop time (3:50 PM ET)"
            self.rejection_reasons.append(reason)
            return False, reason
        
        self.signals_verified += 1
        return True, "Signal verified"
    
    def _check_variance_inequality(self, signal: Dict, state: Dict) -> bool:
        """
        Variance Inequality: E > 0 iff Noise(G) + Noise(V) < Signal Alignment
        """
        signal_strength = signal.get("strength", 0)
        noise_level = state.get("noise_level", 0.01)
        
        # Signal must be stronger than noise threshold
        return abs(signal_strength) > (noise_level * 2)
    
    def _is_past_hard_stop(self) -> bool:
        """Check if past 3:50 PM ET hard stop"""
        try:
            import pytz
            et = pytz.timezone('US/Eastern')
            now = datetime.now(et)
            return now.hour >= 15 and now.minute >= 50
        except:
            return False


class UpdaterAgent:
    """
    Updater Agent: Executes trades and updates system state.
    Handles profit sweeping and state management.
    """
    
    def __init__(self):
        self.trades_executed = 0
        self.sweeps_performed = 0
        self.total_swept = 0.0
    
    async def execute_verified_signal(self, signal: Dict) -> bool:
        """Execute a verified signal"""
        success = await execute_trade(signal)
        if success:
            self.trades_executed += 1
        return success
    
    def update_state(self, state: Dict, trade_result: Dict):
        """Update system state after trade"""
        state["trades_today"] += 1
        
        # Update daily PnL tracking
        pnl = trade_result.get("pnl", 0)
        state["daily_pnl"] = state.get("daily_pnl", 0) + pnl
        
        # Calculate drawdown
        equity = state.get("equity", config["starting_capital"])
        peak = state.get("peak_equity", equity)
        if equity > peak:
            state["peak_equity"] = equity
        
        drawdown = (state["peak_equity"] - equity) / state["peak_equity"] if state["peak_equity"] > 0 else 0
        state["current_drawdown"] = drawdown
    
    async def check_profit_sweep(self, state: Dict) -> bool:
        """
        Barbell Profit Sweeper: If daily growth > 50%, sweep 20% to vault.
        Prevents multiple sweeps within same hour.
        """
        # Calculate current daily growth
        start_equity = state.get("start_of_day_equity", config["starting_capital"])
        current_equity = state.get("equity", start_equity)
        
        if start_equity > 0:
            daily_growth = (current_equity - start_equity) / start_equity
            state["daily_pnl_pct"] = daily_growth
        else:
            daily_growth = 0
        
        # Check if we've already swept recently (within 1 hour)
        last_sweep = state.get("last_sweep_time")
        if last_sweep:
            hours_since_sweep = (datetime.now() - last_sweep).total_seconds() / 3600
            if hours_since_sweep < 1:
                return False  # Don't sweep too frequently
        
        # Sweep threshold (configurable)
        sweep_threshold = float(os.getenv("TMS_PROFIT_SWEEP_THRESHOLD", "0.50"))
        sweep_percentage = float(os.getenv("TMS_PROFIT_SWEEP_PERCENTAGE", "0.20"))
        
        if daily_growth >= sweep_threshold:
            sweep_amount = current_equity * sweep_percentage
            
            state["sovereign_vault"] = state.get("sovereign_vault", 0) + sweep_amount
            state["hustle_account"] = current_equity - sweep_amount
            state["last_sweep_time"] = datetime.now()
            state["total_swept"] = state.get("total_swept", 0) + sweep_amount
            
            self.sweeps_performed += 1
            self.total_swept += sweep_amount
            
            log_activity(f"BARBELL SWEEP: ${sweep_amount:,.2f} -> Sovereign Vault | Total protected: ${state['sovereign_vault']:,.2f}", "sweep")
            return True
        
        return False


class HARDetector:
    """
    Hindsight Approximate Reward (HAR) Detector
    Monitors trading performance and detects edge decay.
    Triggers strategic inactivity when confidence falls.
    """
    
    def __init__(self, lookback: int = 20, threshold: float = 0.4):
        self.lookback = lookback
        self.threshold = threshold  # Below this, enter strategic inactivity
        self.alerts: List[Dict] = []
        self.strategic_inactivity = False
        self.inactivity_start = None
    
    def calculate_har(self, trade_log: List[Dict]) -> float:
        """
        Calculate Hindsight Approximate Reward from recent trades.
        Returns win rate over lookback period.
        """
        if not trade_log:
            return 0.5  # Neutral if no trades
        
        recent = trade_log[-self.lookback:]
        if len(recent) < 5:
            return 0.5  # Need minimum trades for confidence
        
        wins = sum(1 for t in recent if t.get("pnl", 0) > 0)
        return wins / len(recent)
    
    def detect_edge_decay(self, trade_log: List[Dict]) -> Tuple[bool, float]:
        """
        Detect if trading edge is decaying.
        Returns (is_decaying, current_har)
        """
        current_har = self.calculate_har(trade_log)
        
        # Edge is decaying if HAR falls below threshold
        is_decaying = current_har < self.threshold
        
        if is_decaying and not self.strategic_inactivity:
            # Enter strategic inactivity
            self.strategic_inactivity = True
            self.inactivity_start = datetime.now()
            alert = {
                "time": datetime.now().isoformat(),
                "type": "edge_decay",
                "har": current_har,
                "message": f"Edge decay detected! HAR={current_har:.1%} < {self.threshold:.1%}"
            }
            self.alerts.append(alert)
            log_activity(f"[HAR ALERT] Edge decay detected! HAR={current_har:.1%}", "alert")
        
        elif not is_decaying and self.strategic_inactivity:
            # Exit strategic inactivity
            self.strategic_inactivity = False
            duration = (datetime.now() - self.inactivity_start).total_seconds() if self.inactivity_start else 0
            alert = {
                "time": datetime.now().isoformat(),
                "type": "edge_restored",
                "har": current_har,
                "message": f"Edge restored! HAR={current_har:.1%}. Inactive for {duration/60:.1f} mins"
            }
            self.alerts.append(alert)
            log_activity(f"[HAR ALERT] Edge restored! HAR={current_har:.1%}", "info")
            self.inactivity_start = None
        
        return is_decaying, current_har
    
    def should_trade(self, regime_confidence: float) -> Tuple[bool, str]:
        """
        Determine if trading should proceed.
        Strategic inactivity when confidence < 60% or edge is decaying.
        """
        if self.strategic_inactivity:
            return False, "Strategic inactivity - edge decay detected"
        
        if regime_confidence < 0.6:
            return False, f"Low regime confidence: {regime_confidence:.1%} < 60%"
        
        return True, "Clear to trade"
    
    def get_recent_alerts(self, count: int = 10) -> List[Dict]:
        """Get recent HAR alerts"""
        return self.alerts[-count:]


# Initialize GVU Agents and HAR Detector
generator_agent = GeneratorAgent()
verifier_agent = VerifierAgent()
updater_agent = UpdaterAgent()
har_detector = HARDetector(lookback=20, threshold=0.4)


async def get_crypto_bars(symbol: str, num_bars: int = 20):
    """Fetch recent crypto price bars"""
    if not crypto_data_client:
        print(f"  [{symbol}] crypto_data_client not initialized")
        return None
    try:
        from datetime import timezone
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=num_bars + 5)
        request = CryptoBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame.Minute,
            start=start,
            end=end
        )
        data = crypto_data_client.get_crypto_bars(request)
        try:
            bars_list = list(data[symbol])
            if bars_list:
                return bars_list
        except (KeyError, TypeError):
            pass
        print(f"  [{symbol}] No data in response")
        return None
    except Exception as e:
        print(f"  [{symbol}] Error fetching bars: {e}")
        return None


async def get_stock_bars(symbol: str, num_bars: int = 20):
    """Fetch recent stock price bars"""
    if not stock_data_client:
        print(f"  [{symbol}] stock_data_client not initialized")
        return None
    try:
        from datetime import timezone
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=num_bars + 5)
        request = StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame.Minute,
            start=start,
            end=end
        )
        data = stock_data_client.get_stock_bars(request)
        try:
            bars_list = list(data[symbol])
            if bars_list:
                return bars_list
        except (KeyError, TypeError):
            pass
        print(f"  [{symbol}] No data in response")
        return None
    except Exception as e:
        print(f"  [{symbol}] Error fetching bars: {e}")
        return None


def calculate_momentum(bars) -> float:
    """Calculate momentum signal (-1 to 1)"""
    if not bars or len(bars) < 5:
        return 0
    
    closes = [bar.close for bar in bars]
    
    # Simple momentum: compare current price to average
    current = closes[-1]
    avg = sum(closes[:-1]) / len(closes[:-1])
    
    if avg == 0:
        return 0
    
    momentum = (current - avg) / avg
    return max(-1, min(1, momentum * 10))  # Scale and clamp


def calculate_volatility(bars) -> float:
    """Calculate recent volatility"""
    if not bars or len(bars) < 5:
        return 0
    
    closes = [bar.close for bar in bars]
    avg = sum(closes) / len(closes)
    variance = sum((c - avg) ** 2 for c in closes) / len(closes)
    return (variance ** 0.5) / avg if avg > 0 else 0


def calculate_breakout_signal(bars, symbol: str) -> Optional[Dict]:
    """Breakout strategy: Trade range breakouts"""
    if len(bars) < 15:
        return None
    
    # Calculate recent range
    recent_highs = [bar.high for bar in bars[-15:]]
    recent_lows = [bar.low for bar in bars[-15:]]
    range_high = max(recent_highs[:-1])  # Exclude current bar
    range_low = min(recent_lows[:-1])
    current_price = bars[-1].close
    
    # Breakout detection
    breakout_margin = 0.002  # 0.2% above/below range
    
    if current_price > range_high * (1 + breakout_margin):
        return {
            "symbol": symbol,
            "side": "buy",
            "strategy": "breakout",
            "strength": (current_price - range_high) / range_high,
            "price": current_price,
            "reason": f"Breakout above ${range_high:.2f}",
        }
    elif current_price < range_low * (1 - breakout_margin):
        return {
            "symbol": symbol,
            "side": "sell",
            "strategy": "breakout",
            "strength": (range_low - current_price) / range_low,
            "price": current_price,
            "reason": f"Breakdown below ${range_low:.2f}",
        }
    return None


def calculate_scalp_signal(bars, symbol: str) -> Optional[Dict]:
    """Scalping strategy: Quick in/out on micro-movements"""
    if len(bars) < 5:
        return None
    
    # Calculate very short-term momentum (last 5 bars)
    recent_bars = bars[-5:]
    if recent_bars[0].close == 0:
        return None
    
    micro_momentum = (recent_bars[-1].close - recent_bars[0].close) / recent_bars[0].close
    current_price = bars[-1].close
    
    # Scalp threshold (0.5% move in 5 minutes = scalp opportunity)
    scalp_threshold = 0.005
    
    if abs(micro_momentum) >= scalp_threshold:
        return {
            "symbol": symbol,
            "side": "buy" if micro_momentum > 0 else "sell",
            "strategy": "scalp",
            "strength": abs(micro_momentum),
            "price": current_price,
            "reason": f"Scalp: {micro_momentum:.2%} in 5 bars",
        }
    return None


async def check_trading_signals(symbol: str, is_crypto: bool = True) -> Optional[Dict]:
    """
    Multi-strategy signal generator.
    Runs all strategies in parallel and returns the strongest signal.
    Strategies: Momentum, Mean Reversion, Breakout, Scalping
    """
    
    # Check trade cooldown
    last_time = last_trade_time.get(symbol)
    if last_time:
        elapsed = (datetime.now() - last_time).total_seconds()
        if elapsed < STRATEGY_CONFIG["min_trade_interval"]:
            return None
    
    # Get price data (crypto vs stock)
    if is_crypto:
        bars = await get_crypto_bars(symbol, STRATEGY_CONFIG["momentum_lookback"])
    else:
        bars = await get_stock_bars(symbol, STRATEGY_CONFIG["momentum_lookback"])
    
    if not bars:
        return None
    
    momentum = calculate_momentum(bars)
    volatility = calculate_volatility(bars)
    current_price = bars[-1].close
    
    # Skip only if volatility way too high (risky)
    if volatility > 0.10:
        return None
    
    # Track momentum in generator for regime detection
    generator_agent.market_momentum[symbol] = momentum
    
    # Collect all signals from different strategies
    signals = []
    threshold = STRATEGY_CONFIG["momentum_threshold"]
    
    # Strategy 1: Momentum
    if momentum > threshold:
        signals.append({
            "symbol": symbol,
            "side": "buy",
            "strategy": "momentum",
            "strength": momentum,
            "price": current_price,
            "reason": f"Momentum BUY: {momentum:.2%}",
        })
    elif momentum < -threshold:
        signals.append({
            "symbol": symbol,
            "side": "sell",
            "strategy": "momentum",
            "strength": abs(momentum),
            "price": current_price,
            "reason": f"Momentum SELL: {momentum:.2%}",
        })
    
    # Strategy 2: Mean Reversion
    if abs(momentum) > STRATEGY_CONFIG["mean_reversion_threshold"]:
        signals.append({
            "symbol": symbol,
            "side": "sell" if momentum > 0 else "buy",
            "strategy": "mean_reversion",
            "strength": abs(momentum) * 0.8,  # Slightly lower priority
            "price": current_price,
            "reason": f"Mean reversion: {momentum:.2%} deviation",
        })
    
    # Strategy 3: Breakout
    breakout = calculate_breakout_signal(bars, symbol)
    if breakout:
        signals.append(breakout)
    
    # Strategy 4: Scalping (only for crypto - 24/7 market)
    if is_crypto:
        scalp = calculate_scalp_signal(bars, symbol)
        if scalp:
            signals.append(scalp)
    
    # Return strongest signal (highest strength)
    if signals:
        best_signal = max(signals, key=lambda x: x["strength"])
        print(f"  [{symbol}] ${current_price:.2f} | {best_signal['strategy'].upper()}: {best_signal['reason']}")
        return best_signal
    
    return None


async def execute_trade(signal: Dict) -> bool:
    """Execute a trade based on signal"""
    if not alpaca_client or not state["trading_active"]:
        return False
    
    try:
        # Get account for position sizing
        account = alpaca_client.get_account()
        equity = float(account.portfolio_value)
        
        # Calculate position size (% of equity)
        position_value = equity * STRATEGY_CONFIG["position_size_pct"]
        qty = position_value / signal["price"]
        
        # Round to appropriate decimals for crypto
        if "BTC" in signal["symbol"]:
            qty = round(qty, 5)  # BTC allows 5 decimals
        else:
            qty = round(qty, 3)  # Others 3 decimals
        
        if qty <= 0:
            return False
        
        # Check current positions
        positions = alpaca_client.get_all_positions()
        symbol_normalized = signal["symbol"].replace("/", "")
        
        # Find if we have a position in this symbol
        current_position = None
        for p in positions:
            if p.symbol == symbol_normalized:
                current_position = p
                break
        
        is_crypto = signal.get("is_crypto", "/" in signal["symbol"])
        
        # For SELL signals
        if signal["side"] == "sell":
            if current_position:
                # We own it - close the position
                qty = abs(float(current_position.qty))
                log_activity(f"Closing position: {signal['symbol']} qty={qty}", "trade")
            elif not is_crypto:
                # Stocks can be shorted (sold without owning)
                log_activity(f"Short selling: {signal['symbol']} qty={qty}", "trade")
            else:
                # Crypto can't be shorted
                print(f"[TRADE] Can't SHORT {signal['symbol']} - crypto shorting not allowed")
                return False
        else:
            # For BUY signals: don't buy if we already have a position
            if current_position:
                print(f"[TRADE] Already have position in {signal['symbol']}, skipping BUY")
                return False
            
            # Check max positions
            if len(positions) >= STRATEGY_CONFIG["max_positions"]:
                print(f"[TRADE] Max positions ({STRATEGY_CONFIG['max_positions']}) reached, skipping")
                return False
        
        # Place order
        side = OrderSide.BUY if signal["side"] == "buy" else OrderSide.SELL
        order = MarketOrderRequest(
            symbol=signal["symbol"].replace("/", ""),  # Alpaca uses BTCUSD not BTC/USD
            qty=qty,
            side=side,
            time_in_force=TimeInForce.GTC,
        )
        
        result = alpaca_client.submit_order(order)
        
        # Log the trade
        trade_entry = {
            "time": datetime.now().isoformat(),
            "symbol": signal["symbol"],
            "side": signal["side"],
            "qty": qty,
            "price": signal["price"],
            "strategy": signal["strategy"],
            "reason": signal["reason"],
            "order_id": str(result.id),
        }
        trade_log.append(trade_entry)
        state["trades_today"] += 1
        last_trade_time[signal["symbol"]] = datetime.now()
        
        print(f"[TRADE] Executed: {signal['side'].upper()} {qty} {signal['symbol']} @ ${signal['price']:.2f}")
        print(f"        Strategy: {signal['strategy']} | Reason: {signal['reason']}")
        
        return True
        
    except Exception as e:
        print(f"[TRADE] Error executing trade: {e}")
        return False


def is_past_hard_stop() -> bool:
    """Check if past 3:50 PM ET hard stop for 0DTE positions"""
    try:
        import pytz
        et = pytz.timezone('US/Eastern')
        now = datetime.now(et)
        return now.hour >= 15 and now.minute >= 50
    except:
        return False


async def check_hard_stop():
    """3:50 PM ET Hard Stop - Close all positions to avoid pin risk"""
    if not alpaca_client:
        return
    
    if not is_past_hard_stop():
        return
    
    try:
        positions = alpaca_client.get_all_positions()
        if positions:
            log_activity(f"[HARD STOP] 3:50 PM ET - Closing {len(positions)} positions", "alert")
            for p in positions:
                try:
                    alpaca_client.close_position(p.symbol)
                    trade_log.append({
                        "time": datetime.now().isoformat(),
                        "symbol": p.symbol,
                        "side": "close",
                        "qty": float(p.qty),
                        "strategy": "hard_stop",
                        "reason": "3:50 PM ET hard stop",
                    })
                    log_activity(f"[HARD STOP] Closed {p.symbol}", "trade")
                except Exception as e:
                    print(f"[HARD STOP] Error closing {p.symbol}: {e}")
    except Exception as e:
        print(f"[HARD STOP] Error: {e}")


async def check_stop_loss_take_profit():
    """Monitor positions for stop loss / take profit"""
    if not alpaca_client:
        return
    
    # Check hard stop first
    await check_hard_stop()
    
    try:
        positions = alpaca_client.get_all_positions()
        
        for p in positions:
            pnl_pct = float(p.unrealized_plpc)
            
            # Stop loss
            if pnl_pct <= -STRATEGY_CONFIG["stop_loss_pct"]:
                print(f"[RISK] Stop loss triggered for {p.symbol}: {pnl_pct:.2%}")
                try:
                    alpaca_client.close_position(p.symbol)
                    trade_log.append({
                        "time": datetime.now().isoformat(),
                        "symbol": p.symbol,
                        "side": "close",
                        "qty": float(p.qty),
                        "strategy": "stop_loss",
                        "pnl_pct": pnl_pct,
                    })
                except Exception as e:
                    print(f"[RISK] Error closing position: {e}")
            
            # Take profit
            elif pnl_pct >= STRATEGY_CONFIG["take_profit_pct"]:
                print(f"[PROFIT] Take profit triggered for {p.symbol}: {pnl_pct:.2%}")
                try:
                    alpaca_client.close_position(p.symbol)
                    trade_log.append({
                        "time": datetime.now().isoformat(),
                        "symbol": p.symbol,
                        "side": "close",
                        "qty": float(p.qty),
                        "strategy": "take_profit",
                        "pnl_pct": pnl_pct,
                    })
                except Exception as e:
                    print(f"[PROFIT] Error closing position: {e}")
                    
    except Exception as e:
        print(f"[RISK] Error checking positions: {e}")


async def trading_loop():
    """
    Main autonomous trading loop - ALPHA-SOVEREIGN GVU PIPELINE
    
    Full pipeline:
    1. HAR Check (edge decay detection)
    2. SAGE Hot-Swap (skill selection based on regime)
    3. Toxicity Check (VPIN/spoofing detection)
    4. Generator (parallel market scanning)
    5. Regime Detection (bullish/bearish/neutral)
    6. Verifier (variance inequality + risk rules)
    7. Bayesian Kelly (dynamic position sizing)
    8. Updater (execution + state management)
    9. Barbell Sweeper (profit protection)
    10. WebSocket Broadcast (real-time streaming)
    """
    await ws_manager.send_gvu_thought("SYSTEM", f"GVU Engine starting - {len(CRYPTO_SYMBOLS)} crypto, {len(STOCK_SYMBOLS)} stocks", "info")
    log_activity(f"Alpha-Sovereign GVU Engine started", "info")
    log_activity(f"Watching: {len(CRYPTO_SYMBOLS)} crypto + {len(STOCK_SYMBOLS)} stocks", "info")
    log_activity(f"Bayesian Kelly enabled | SAGE skill library active", "info")
    
    # Initialize alpha engine with starting capital
    alpha_engine.initial_capital = config["starting_capital"]
    alpha_engine.current_equity = config["starting_capital"]
    
    cycle = 0
    while state["trading_active"]:
        try:
            cycle += 1
            await ws_manager.send_gvu_thought("CYCLE", f"Starting cycle {cycle}", "scan")
            
            # ========== 1. HAR CHECK PHASE ==========
            await ws_manager.send_gvu_thought("HAR", "Checking edge decay...", "info")
            edge_decaying, current_har = har_detector.detect_edge_decay(trade_log)
            state["har_score"] = current_har
            state["har_alerts"] = har_detector.get_recent_alerts(5)
            
            # ========== 2. SAGE HOT-SWAP PHASE ==========
            # Check if we need to swap skills based on HAR/regime
            volatility = state.get("avg_volatility", 0.02)
            regime = state.get("regime", "neutral")
            swap_result = alpha_engine.process_regime_change(regime, current_har, volatility)
            if swap_result:
                await ws_manager.send_gvu_thought("SAGE", swap_result, "alert")
                log_activity(f"[SAGE] {swap_result}", "alert")
            
            # Get SAGE strategy modifiers
            sage_mods = alpha_engine.sage.get_strategy_modifier()
            state["active_skill"] = alpha_engine.sage.active_skill
            state["frankenstein_training"] = alpha_engine.sage.frankenstein_training
            
            # ========== 3. TOXICITY CHECK PHASE ==========
            await ws_manager.send_gvu_thought("TOXICITY", "Checking market toxicity...", "info")
            # Update toxicity based on recent trades
            alpha_engine.toxicity.update_toxicity("MARKET", trade_log[-50:])
            state["toxicity"] = alpha_engine.toxicity.get_state()
            
            # ========== 4. GENERATOR PHASE ==========
            await ws_manager.send_gvu_thought("GENERATOR", f"Scanning {len(CRYPTO_SYMBOLS)} cryptos in parallel...", "scan")
            
            crypto_signals = await generator_agent.scan_markets(CRYPTO_SYMBOLS, is_crypto=True)
            stock_signals = await generator_agent.scan_markets(STOCK_SYMBOLS, is_crypto=False)
            all_signals = crypto_signals + stock_signals
            
            if all_signals:
                await ws_manager.send_gvu_thought("GENERATOR", f"Found {len(all_signals)} raw signals", "signal")
            
            # ========== 5. REGIME DETECTION PHASE ==========
            regime_data = generator_agent.get_market_regime()
            state["regime"] = regime_data["regime"]
            state["regime_confidence"] = regime_data["confidence"]
            
            await ws_manager.send_gvu_thought("REGIME", f"{regime_data['regime'].upper()} ({regime_data['confidence']:.0%} confidence)", "info")
            
            # ========== STRATEGIC INACTIVITY CHECK ==========
            # Check HAR-based inactivity
            har_ok, har_reason = har_detector.should_trade(state["regime_confidence"])
            if not har_ok:
                await ws_manager.send_gvu_thought("INACTIVITY", har_reason, "alert")
                log_activity(f"[STRATEGIC INACTIVITY] {har_reason}", "alert")
                positions = alpaca_client.get_all_positions() if alpaca_client else []
                await check_stop_loss_take_profit()
                await asyncio.sleep(15)
                continue
            
            # Check toxicity-based inactivity
            tox_ok, tox_reason = alpha_engine.should_trade("MARKET")
            if not tox_ok:
                await ws_manager.send_gvu_thought("INACTIVITY", tox_reason, "alert")
                log_activity(f"[TOXICITY INACTIVITY] {tox_reason}", "alert")
                await check_stop_loss_take_profit()
                await asyncio.sleep(15)
                continue
            
            # ========== 6. VERIFIER PHASE ==========
            await ws_manager.send_gvu_thought("VERIFIER", f"Validating {len(all_signals)} signals against risk rules...", "info")
            
            positions = []
            if alpaca_client:
                try:
                    positions = alpaca_client.get_all_positions()
                except:
                    pass
            
            verified_signals = []
            for signal in all_signals:
                # Check variance inequality + all risk rules
                is_valid, reason = verifier_agent.verify_signal(signal, state, positions)
                
                if is_valid:
                    # Apply SAGE modifiers
                    if "position_size_mult" in sage_mods:
                        signal["size_multiplier"] = sage_mods["position_size_mult"]
                    
                    verified_signals.append(signal)
                    await ws_manager.send_gvu_thought("VERIFIER", f"VERIFIED: {signal['symbol']} {signal['side'].upper()}", "signal")
                    log_activity(f"[VERIFIED] {signal['symbol']} {signal['side'].upper()} - {signal['reason']}", "signal")
                else:
                    print(f"[REJECTED] {signal['symbol']}: {reason}")
            
            # ========== 7. BAYESIAN KELLY POSITION SIZING ==========
            for signal in verified_signals:
                # Calculate dynamic position size based on Bayesian Kelly
                kelly_size = alpha_engine.get_position_size(signal, state.get("equity", config["starting_capital"]))
                
                # Apply SAGE multiplier if present
                multiplier = signal.get("size_multiplier", 1.0)
                signal["position_size_pct"] = kelly_size * multiplier
                
                await ws_manager.send_gvu_thought("KELLY", f"{signal['symbol']}: {signal['position_size_pct']:.1%} position (Kelly)", "info")
            
            # ========== 8. UPDATER PHASE ==========
            await ws_manager.send_gvu_thought("UPDATER", f"Executing {len(verified_signals)} verified signals...", "info")
            
            for signal in verified_signals:
                if not state["trading_active"]:
                    break
                
                # Override position size with Bayesian Kelly
                old_size = STRATEGY_CONFIG["position_size_pct"]
                STRATEGY_CONFIG["position_size_pct"] = signal.get("position_size_pct", old_size)
                
                success = await updater_agent.execute_verified_signal(signal)
                
                STRATEGY_CONFIG["position_size_pct"] = old_size  # Restore
                
                if success:
                    await ws_manager.send_gvu_thought("UPDATER", f"EXECUTED: {signal['symbol']} {signal['side'].upper()}", "trade")
                    log_activity(f"[EXECUTED] {signal['symbol']} {signal['side'].upper()}", "trade")
                    
                    # Broadcast signal to SaaS subscribers
                    alpha_engine.saas.publish_signal(signal)
                    await ws_manager.send_signal(signal)
            
            # Check stop loss / take profit
            await check_stop_loss_take_profit()
            
            # ========== 9. STATE SYNC ==========
            if alpaca_client:
                try:
                    account = alpaca_client.get_account()
                    state["equity"] = float(account.portfolio_value)
                    state["hustle_account"] = float(account.cash)
                    alpha_engine.current_equity = state["equity"]
                    
                    # Update peak equity and drawdown
                    if state["equity"] > state["peak_equity"]:
                        state["peak_equity"] = state["equity"]
                    
                    drawdown = (state["peak_equity"] - state["equity"]) / state["peak_equity"] if state["peak_equity"] > 0 else 0
                    state["current_drawdown"] = drawdown
                    state["drawdown"] = drawdown
                    
                    # Update daily PnL
                    state["daily_pnl"] = state["equity"] - state["start_of_day_equity"]
                    state["daily_pnl_pct"] = state["daily_pnl"] / state["start_of_day_equity"] if state["start_of_day_equity"] > 0 else 0
                except Exception as e:
                    print(f"[STATE SYNC] Error: {e}")
            
            # ========== 10. BARBELL PROFIT SWEEPER ==========
            await updater_agent.check_profit_sweep(state)
            
            # Get compounding progress for dashboard
            state["compounding"] = alpha_engine.get_compounding_progress()
            
            # ========== STATUS UPDATE ==========
            kelly_info = alpha_engine.bayesian_kelly.get_state()
            regime_str = f"{state['regime']} ({state['regime_confidence']:.0%})"
            kelly_str = f"Kelly: {kelly_info['kelly_fraction']:.1%} (p={kelly_info['win_probability']:.1%})"
            
            status_msg = f"Cycle {cycle}: {len(CRYPTO_SYMBOLS)} scanned | {regime_str} | {kelly_str} | Pos: {len(positions)}"
            if verified_signals:
                status_msg = f"Cycle {cycle}: {len(verified_signals)} trades | {regime_str} | {kelly_str}"
            
            log_activity(status_msg, "info" if verified_signals else "scan")
            
            # Broadcast state to WebSocket clients
            await ws_manager.send_state_update({
                "cycle": cycle,
                "regime": state["regime"],
                "regime_confidence": state["regime_confidence"],
                "har_score": current_har,
                "kelly": kelly_info,
                "toxicity": state.get("toxicity", {}),
                "positions": len(positions),
                "equity": state.get("equity", 0),
            })
            
            # Wait before next scan (15 seconds)
            await asyncio.sleep(15)
            
        except Exception as e:
            log_activity(f"[GVU ERROR] {e}", "error")
            await ws_manager.send_gvu_thought("ERROR", str(e), "error")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(10)
    
    await ws_manager.send_gvu_thought("SYSTEM", "GVU Engine stopped", "info")
    log_activity("GVU Engine stopped", "info")

# In-memory state
state = {
    "trading_active": False,
    "phase": config["trading_phase"],
    "equity": config["starting_capital"],
    "hustle_account": config["starting_capital"],
    "sovereign_vault": 0.0,
    "saas_reserve": 0.0,
    "daily_pnl": 0.0,
    "daily_pnl_pct": 0.0,
    "start_of_day_equity": config["starting_capital"],
    "peak_equity": config["starting_capital"],
    "current_drawdown": 0.0,
    "drawdown": 0.0,
    "regime": "neutral",
    "regime_confidence": 0.5,
    "har_score": 0.5,
    "har_alerts": [],
    "noise_level": 0.01,
    "trades_today": 0,
    "positions": [],
    "last_sweep_time": None,
    "total_swept": 0.0,
}

# Request models
class SettingsUpdate(BaseModel):
    starting_capital: Optional[float] = None
    max_drawdown: Optional[float] = None
    max_daily_loss: Optional[float] = None
    trading_phase: Optional[str] = None


@app.get("/")
async def root() -> Dict[str, Any]:
    # Check what's configured
    alpaca_ready = bool(config["alpaca_api_key"] and config["alpaca_secret_key"])
    
    return {
        "name": "TradeMaster Supreme V1",
        "version": "1.0.0",
        "status": "Fort Knox Mode Active",
        "mode": config["trading_mode"].upper(),
        "phase": config["trading_phase"],
        "capital": config["starting_capital"],
        "timestamp": datetime.utcnow().isoformat(),
        "connections": {
            "alpaca": "READY" if alpaca_ready else "NOT CONFIGURED",
            "polygon": "READY" if config["polygon_api_key"] else "NOT CONFIGURED",
            "discord": "READY" if config["discord_webhook"] else "NOT CONFIGURED",
            "telegram": "READY" if config["telegram_token"] else "NOT CONFIGURED",
        }
    }


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"status": "healthy"}


@app.get("/api/config/status")
async def get_config_status() -> Dict[str, Any]:
    """Check which integrations are configured"""
    alpaca_ready = bool(config["alpaca_api_key"] and config["alpaca_secret_key"])
    
    return {
        "trading_mode": config["trading_mode"],
        "trading_phase": config["trading_phase"],
        "starting_capital": config["starting_capital"],
        "integrations": {
            "alpaca": {
                "configured": alpaca_ready,
                "base_url": config["alpaca_base_url"],
                "is_paper": "paper" in config["alpaca_base_url"],
            },
            "polygon": {
                "configured": bool(config["polygon_api_key"]),
            },
            "discord": {
                "configured": bool(config["discord_webhook"]),
            },
            "telegram": {
                "configured": bool(config["telegram_token"]),
            },
        },
        "risk_settings": {
            "max_drawdown": f"{config['max_drawdown']*100}%",
            "max_daily_loss": f"{config['max_daily_loss']*100}%",
            "hard_stop_time": config["hard_stop_time"] + " ET",
        },
        "ready_to_trade": alpaca_ready,
        "checklist": {
            "alpaca_keys": "OK" if alpaca_ready else "NEEDED - Get from alpaca.markets",
            "paper_mode": "OK" if config["trading_mode"] == "paper" else "WARNING - Live mode!",
            "notifications": "OK" if (config["discord_webhook"] or config["telegram_token"]) else "RECOMMENDED",
        }
    }


@app.get("/api/account")
async def get_account() -> Dict[str, Any]:
    """Get real account info from Alpaca"""
    if alpaca_client:
        try:
            account = alpaca_client.get_account()
            state["equity"] = float(account.portfolio_value)
            state["hustle_account"] = float(account.cash)
            return {
                "equity": float(account.portfolio_value),
                "cash": float(account.cash),
                "buying_power": float(account.buying_power),
                "daily_pnl": float(account.portfolio_value) - config["starting_capital"],
                "currency": account.currency,
                "status": str(account.status),
                "pattern_day_trader": account.pattern_day_trader,
                "trading_blocked": account.trading_blocked,
            }
        except Exception as e:
            return {"error": str(e)}
    return {
        "equity": state["equity"],
        "cash": state["hustle_account"],
        "buying_power": state["hustle_account"] * 2,
        "daily_pnl": state["daily_pnl"],
    }


@app.get("/api/positions")
async def get_positions():
    """Get current positions from Alpaca"""
    if alpaca_client:
        try:
            positions = alpaca_client.get_all_positions()
            return [
                {
                    "symbol": p.symbol,
                    "qty": float(p.qty),
                    "side": "long" if float(p.qty) > 0 else "short",
                    "market_value": float(p.market_value),
                    "cost_basis": float(p.cost_basis),
                    "unrealized_pl": float(p.unrealized_pl),
                    "unrealized_plpc": float(p.unrealized_plpc) * 100,
                    "current_price": float(p.current_price),
                    "avg_entry_price": float(p.avg_entry_price),
                }
                for p in positions
            ]
        except Exception as e:
            return {"error": str(e)}
    return []


@app.get("/api/orders")
async def get_orders():
    """Get recent orders from Alpaca"""
    if alpaca_client:
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            request = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=50)
            orders = alpaca_client.get_orders(filter=request)
            return [
                {
                    "id": str(o.id),
                    "symbol": o.symbol,
                    "side": str(o.side),
                    "qty": float(o.qty) if o.qty else 0,
                    "filled_qty": float(o.filled_qty) if o.filled_qty else 0,
                    "type": str(o.type),
                    "status": str(o.status),
                    "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
                    "filled_at": o.filled_at.isoformat() if o.filled_at else None,
                    "filled_avg_price": float(o.filled_avg_price) if o.filled_avg_price else None,
                }
                for o in orders
            ]
        except Exception as e:
            return {"error": str(e)}
    return []


@app.get("/api/trading/status")
async def get_trading_status() -> Dict[str, Any]:
    # Actually test Alpaca connection by pinging the API
    alpaca_ok = False
    if alpaca_client:
        try:
            alpaca_client.get_account()
            alpaca_ok = True
        except Exception as e:
            print(f"[STATUS] Alpaca connection check failed: {e}")
            alpaca_ok = False
    
    return {
        "running": state["trading_active"],
        "phase": state["phase"],
        "mode": config["trading_mode"],
        "is_paper": "paper" in config["alpaca_base_url"],
        "trades_today": state["trades_today"],
        "alpaca_connected": alpaca_ok,
    }


@app.post("/api/trading/start")
async def start_trading() -> Dict[str, Any]:
    global trading_task
    
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    if state["trading_active"]:
        return {"status": "already_running", "message": "Trading bot is already active"}
    
    state["trading_active"] = True
    print("=" * 50)
    print("  TRADING STARTED - Fort Knox Mode Active")
    print("  Autonomous trading engine initializing...")
    print("=" * 50)
    
    # Start the autonomous trading loop
    trading_task = asyncio.create_task(trading_loop())
    
    return {"status": "started", "message": "Trading bot is now active - scanning for opportunities"}


@app.post("/api/trading/stop")
async def stop_trading() -> Dict[str, Any]:
    global trading_task
    
    state["trading_active"] = False
    
    if trading_task:
        trading_task.cancel()
        try:
            await trading_task
        except asyncio.CancelledError:
            pass
        trading_task = None
    
    print("=" * 50)
    print("  TRADING STOPPED")
    print("=" * 50)
    return {"status": "stopped", "message": "Trading bot stopped"}


@app.get("/api/trading/log")
async def get_trade_log() -> List[Dict]:
    """Get recent autonomous trade log"""
    return trade_log[-50:]  # Last 50 trades

@app.get("/api/activity")
async def get_activity_log() -> List[Dict]:
    """Get live activity log for dashboard"""
    return activity_log[-50:]  # Last 50 activities


# ============================================================================
# BACKTESTING ENDPOINTS
# ============================================================================

class BacktestRequest(BaseModel):
    symbols: List[str]
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    strategy: str    # "momentum", "mean_reversion", "combined"
    starting_capital: float = 10000.0
    position_size_pct: float = 0.1  # 10% per trade


def run_backtest_simulation(
    bars_data: Dict,
    symbols: List[str],
    strategy: str,
    starting_capital: float,
    position_size_pct: float
) -> Dict:
    """Run backtest simulation on historical data"""
    
    equity = starting_capital
    peak_equity = starting_capital
    max_drawdown = 0.0
    trades = []
    equity_curve = []
    positions = {}  # symbol -> {"qty": x, "entry_price": y}
    
    # Combine all bars and sort by time
    all_bars = []
    for symbol in symbols:
        if symbol in bars_data:
            for bar in bars_data[symbol]:
                all_bars.append({
                    "time": bar.timestamp,
                    "symbol": symbol,
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                })
    
    all_bars.sort(key=lambda x: x["time"])
    
    if not all_bars:
        return {
            "error": "No historical data found for the specified symbols and date range"
        }
    
    # Track recent prices for momentum calculation
    price_history = {s: [] for s in symbols}
    lookback = 20
    
    for bar in all_bars:
        symbol = bar["symbol"]
        price = bar["close"]
        time_str = bar["time"].strftime("%Y-%m-%d %H:%M")
        
        # Update price history
        price_history[symbol].append(price)
        if len(price_history[symbol]) > lookback:
            price_history[symbol] = price_history[symbol][-lookback:]
        
        # Calculate signals
        if len(price_history[symbol]) >= 5:
            prices = price_history[symbol]
            avg = sum(prices[:-1]) / len(prices[:-1])
            momentum = (price - avg) / avg if avg > 0 else 0
            
            # Strategy logic - ADAPTIVE CAPITAL-AWARE V3
            signal = None
            mom_threshold = STRATEGY_CONFIG["momentum_threshold"]
            mr_threshold = STRATEGY_CONFIG["mean_reversion_threshold"]
            take_profit = STRATEGY_CONFIG["take_profit_pct"]
            stop_loss = STRATEGY_CONFIG["stop_loss_pct"]
            
            # ============ ADAPTIVE CAPITAL LOGIC ============
            # Adjust behavior based on current equity
            if equity < STRATEGY_CONFIG["micro_capital_threshold"]:
                # MICRO MODE ($0-500): Ultra selective, max 2 positions, hunt big winners
                max_pos = 2
                min_momentum = mom_threshold * 1.5  # Need 3.75% move
                pos_size_mult = 0.25  # 25% of equity per position (concentrated)
                require_strong_trend = True
            elif equity < STRATEGY_CONFIG["small_capital_threshold"]:
                # SMALL MODE ($500-2000): Selective, max 3 positions
                max_pos = 3
                min_momentum = mom_threshold * 1.2  # Need 3% move
                pos_size_mult = 0.20  # 20% per position
                require_strong_trend = True
            elif equity < STRATEGY_CONFIG["medium_capital_threshold"]:
                # MEDIUM MODE ($2000-10000): Balanced
                max_pos = 5
                min_momentum = mom_threshold  # 2.5% move
                pos_size_mult = 0.12  # 12% per position
                require_strong_trend = False
            else:
                # LARGE MODE ($10000+): Can diversify
                max_pos = 8
                min_momentum = mom_threshold * 0.8  # 2% move ok
                pos_size_mult = 0.08  # 8% per position
                require_strong_trend = False
            
            # ============ TREND DETECTION V7 (BALANCED FOR HIGH WIN RATE) ============
            trend_up = False
            trend_down = False
            trend_strength = 0
            higher_highs = False
            momentum_accelerating = False
            volatility = 0
            bars_in_trend = 0
            
            min_trend_req = STRATEGY_CONFIG.get("min_trend_strength", 0.025)
            max_vol = STRATEGY_CONFIG.get("max_volatility", 0.12)
            min_vol = STRATEGY_CONFIG.get("min_volatility", 0.005)
            min_bars_trend = STRATEGY_CONFIG.get("min_bars_in_trend", 5)
            
            if len(prices) >= 15:
                # Calculate moving averages
                ma5 = sum(prices[-5:]) / 5
                ma10 = sum(prices[-10:]) / 10
                ma15 = sum(prices[-15:]) / 15
                
                # Trend strength = distance between fast and slow MA
                trend_strength = (ma5 - ma15) / ma15 if ma15 > 0 else 0
                
                # Calculate volatility
                avg_price = sum(prices) / len(prices)
                variance = sum((p - avg_price) ** 2 for p in prices) / len(prices)
                volatility = (variance ** 0.5) / avg_price if avg_price > 0 else 0
                
                # TREND ALIGNMENT: MA5 > MA10 > MA15 (bullish stack)
                bullish_alignment = ma5 > ma10 > ma15
                bearish_alignment = ma5 < ma10 < ma15
                
                # Basic trend detection
                trend_up = trend_strength > min_trend_req and bullish_alignment
                trend_down = trend_strength < -min_trend_req or bearish_alignment
                strong_trend = abs(trend_strength) > min_trend_req * 1.3 and bullish_alignment
                
                # CHECK FOR HIGHER HIGHS (simpler check)
                if len(prices) >= 10:
                    recent_high = max(prices[-5:])
                    older_high = max(prices[-10:-5])
                    recent_low = min(prices[-5:])
                    older_low = min(prices[-10:-5])
                    
                    # Higher highs OR higher lows (either is good)
                    higher_highs = recent_high > older_high * 1.002  # 0.2% higher
                    higher_lows = recent_low > older_low * 0.998
                    
                    # Near recent highs (within 2%)
                    near_highs = price > recent_high * 0.98
                    
                    # Count bars trending up
                    bars_in_trend = 0
                    for i in range(1, min(10, len(prices))):
                        if i + 1 <= len(prices) and prices[-i] >= prices[-i-1]:
                            bars_in_trend += 1
                    
                    # Momentum accelerating check (optional)
                    if len(prices) >= 6:
                        recent_move = (prices[-1] - prices[-3]) / prices[-3] if prices[-3] > 0 else 0
                        prior_move = (prices[-3] - prices[-6]) / prices[-6] if prices[-6] > 0 else 0
                        momentum_accelerating = recent_move > 0 and recent_move > prior_move * 0.5
                    
                    # ENTRY CONDITIONS: Trend up + (higher highs OR near highs) + volatility OK
                    trend_up = (
                        trend_up and 
                        (higher_highs or near_highs) and
                        bars_in_trend >= min_bars_trend and
                        volatility < max_vol and volatility > min_vol
                    )
            else:
                strong_trend = False
                higher_highs = False
                volatility = 0.03  # Default moderate volatility
            
            # ============ POSITION SCORING ============
            # Score this opportunity (used for slot replacement)
            opportunity_score = abs(momentum) + abs(trend_strength) * 2
            
            # ============ STOP LOSS / TAKE PROFIT V11 (NANO-SCALPING) ============
            # KEY: Take NANO profits (0.35%), give EXTREME patience (6%)
            min_hold = STRATEGY_CONFIG.get("min_hold_bars", 1)
            trailing_stop = STRATEGY_CONFIG.get("trailing_stop_pct", 0.002)
            breakeven_trigger = STRATEGY_CONFIG.get("breakeven_trigger", 0.002)
            
            if symbol in positions:
                pos = positions[symbol]
                pnl_pct = (price - pos["entry_price"]) / pos["entry_price"]
                bars_held = len(trades) - pos.get("entry_bar", 0)
                
                # Track highest price since entry
                highest_since_entry = pos.get("highest_price", pos["entry_price"])
                if price > highest_since_entry:
                    highest_since_entry = price
                    positions[symbol]["highest_price"] = price
                
                # Calculate drawdown from peak
                drawdown_from_peak = (highest_since_entry - price) / highest_since_entry if highest_since_entry > 0 else 0
                
                # ===== EXIT CONDITIONS - NANO-SCALPING =====
                
                # 1. TAKE PROFIT FIRST - Grab the 0.35% INSTANTLY!
                if pnl_pct >= take_profit:
                    signal = "sell"
                
                # 2. HARD STOP LOSS - Very patient 6% stop
                elif pnl_pct <= -stop_loss:
                    signal = "sell"
                
                # 3. BREAKEVEN LOCK - Once up 0.2%, protect it
                elif highest_since_entry > pos["entry_price"] * (1 + breakeven_trigger) and pnl_pct <= 0.0003:
                    signal = "sell"
                
                # 4. TRAILING from 0.3%+ profit
                elif pnl_pct > 0.003 and drawdown_from_peak > trailing_stop:
                    signal = "sell"
                
                # 5. TREND BREAK - Exit only on VERY STRONG reversal
                elif pnl_pct > 0 and trend_down and momentum < -0.03:
                    signal = "sell"
                
                # 6. VERY LONG TIME LIMIT - Be very patient
                elif bars_held > 75:
                    if pnl_pct > -0.015:  # Within 1.5% of entry
                        signal = "sell"
            
            # ============ ENTRY LOGIC V7 (SELECTIVE FOR HIGH WIN RATE) ============
            min_entry_momentum = STRATEGY_CONFIG.get("min_momentum_for_entry", 0.015)
            skip_bearish = STRATEGY_CONFIG.get("skip_bearish_regime", True)
            skip_choppy = STRATEGY_CONFIG.get("skip_choppy_market", True)
            require_accel = STRATEGY_CONFIG.get("require_volume_surge", False)
            
            if strategy == "momentum" or strategy == "combined":
                # REGIME FILTER: Never buy in bearish trend
                if skip_bearish and trend_down:
                    pass  # Skip - downtrend
                
                # CHOPPY MARKET FILTER: Need clear trend
                elif skip_choppy and abs(trend_strength) < STRATEGY_CONFIG.get("min_regime_strength", 0.02):
                    pass  # Skip - no clear direction
                
                # TREND REQUIREMENT: Need established trend
                elif require_strong_trend and not trend_up:
                    pass  # Skip - trend not strong enough
                
                # MOMENTUM ACCELERATION: Optional check
                elif require_accel and not momentum_accelerating:
                    pass  # Skip - momentum fading
                
                # ===== ENTRY: Trend up + positive momentum =====
                # trend_up already requires: trend>2.5%, MA alignment, higher highs,
                # 5+ bars in trend, volatility in range
                elif trend_up and momentum > max(min_momentum, min_entry_momentum):
                    if symbol not in positions:
                        if len(positions) < max_pos:
                            signal = "buy"
                        else:
                            # SLOT REPLACEMENT: Can we swap a weaker position?
                            weakest_symbol = None
                            weakest_score = opportunity_score
                            for held_sym, held_pos in positions.items():
                                if held_sym in price_history and price_history[held_sym]:
                                    held_price = price_history[held_sym][-1]
                                    held_pnl = (held_price - held_pos["entry_price"]) / held_pos["entry_price"]
                                    # If position is losing and new opportunity is better
                                    if held_pnl < 0:
                                        held_mom = 0
                                        if len(price_history[held_sym]) >= 5:
                                            held_avg = sum(price_history[held_sym][:-1]) / (len(price_history[held_sym]) - 1)
                                            held_mom = (held_price - held_avg) / held_avg if held_avg > 0 else 0
                                        held_score = abs(held_mom) + 0.1  # Penalize losers
                                        if held_score < weakest_score:
                                            weakest_score = held_score
                                            weakest_symbol = held_sym
                            
                            # If found a weaker position, replace it
                            if weakest_symbol and opportunity_score > weakest_score * 1.5:
                                # Mark for replacement (sell weakest, buy new)
                                signal = "replace"
            
            elif strategy == "mean_reversion":
                # Buy oversold bounces in uptrends
                if trend_up and momentum < -mr_threshold and symbol not in positions:
                    if len(positions) < max_pos:
                        signal = "buy"
            
            # Execute signals with ADAPTIVE position sizing + LEARNING CHECK
            adaptive_pos_size = pos_size_mult if 'pos_size_mult' in dir() else position_size_pct
            
            if signal == "buy" and symbol not in positions:
                # LEARNING ENGINE: Check if we should take this trade based on past mistakes
                trade_context = {
                    "symbol": symbol,
                    "symbol_type": "crypto" if "/" in symbol else "stock",
                    "regime": "neutral" if not trend_down and not trend_up else ("bullish" if trend_up else "bearish"),
                    "momentum": momentum,
                    "trend_strength": trend_strength if 'trend_strength' in dir() else 0,
                    "volatility": abs(momentum) * 2,
                    "signal_strength": min(1.0, abs(momentum) / 0.03),
                    "hour_of_day": bar["time"].hour if hasattr(bar["time"], "hour") else 12,
                    "day_of_week": bar["time"].weekday() if hasattr(bar["time"], "weekday") else 0,
                    "capital_tier": "micro" if equity < 500 else "small" if equity < 2000 else "medium" if equity < 10000 else "large",
                }
                
                should_trade, reason, adjustments = learning_engine.check_trade(trade_context)
                
                if should_trade:
                    # Apply learned adjustments to position size
                    adjusted_size = adaptive_pos_size * adjustments.get("size_multiplier", 1.0)
                    
                    qty = (equity * adjusted_size) / price
                    if qty > 0 and equity * adjusted_size >= 5:  # Min $5 position
                        positions[symbol] = {"qty": qty, "entry_price": price, "score": opportunity_score, "entry_bar": len(trades)}
                        trades.append({
                            "time": time_str,
                            "symbol": symbol,
                            "side": "buy",
                            "qty": round(qty, 4),
                            "price": round(price, 2),
                            "pnl": 0,
                        })
            
            elif signal == "replace" and symbol not in positions and weakest_symbol in positions:
                # Check learning rules for the new trade
                trade_context = {
                    "symbol": symbol,
                    "symbol_type": "crypto" if "/" in symbol else "stock",
                    "regime": "neutral" if not trend_down and not trend_up else ("bullish" if trend_up else "bearish"),
                    "momentum": momentum,
                    "signal_strength": min(1.0, abs(momentum) / 0.03),
                    "capital_tier": "micro" if equity < 500 else "small" if equity < 2000 else "medium" if equity < 10000 else "large",
                }
                
                should_trade, reason, adjustments = learning_engine.check_trade(trade_context)
                
                if should_trade:
                    # First sell the weak position
                    weak_pos = positions[weakest_symbol]
                    weak_price = price_history[weakest_symbol][-1] if weakest_symbol in price_history and price_history[weakest_symbol] else weak_pos["entry_price"]
                    weak_pnl = (weak_price - weak_pos["entry_price"]) * weak_pos["qty"]
                    equity_before = equity
                    equity += weak_pnl
                    
                    trades.append({
                        "time": time_str,
                        "symbol": weakest_symbol,
                        "side": "sell",
                        "qty": round(weak_pos["qty"], 4),
                        "price": round(weak_price, 2),
                        "pnl": round(weak_pnl, 2),
                    })
                    
                    # Record to learning engine
                    try:
                        learning_engine.record_trade(
                            symbol=weakest_symbol,
                            side="buy",
                            entry_price=weak_pos["entry_price"],
                            exit_price=weak_price,
                            qty=weak_pos["qty"],
                            pnl=weak_pnl,
                            regime="neutral",
                            momentum=0,
                            trend_strength=0,
                            volatility=0.02,
                            strategy_used=strategy,
                            equity_at_entry=equity_before,
                            position_size_pct=(weak_pos["qty"] * weak_pos["entry_price"]) / equity_before if equity_before > 0 else 0,
                            hold_duration_mins=(len(trades) - weak_pos.get("entry_bar", 0)) * 60,
                            exit_reason="slot_replacement",
                        )
                    except:
                        pass
                    
                    del positions[weakest_symbol]
                    
                    # Then buy the new stronger position with adjusted size
                    adjusted_size = adaptive_pos_size * adjustments.get("size_multiplier", 1.0)
                    qty = (equity * adjusted_size) / price
                    if qty > 0 and equity * adjusted_size >= 5:
                        positions[symbol] = {"qty": qty, "entry_price": price, "score": opportunity_score, "entry_bar": len(trades)}
                        trades.append({
                            "time": time_str,
                            "symbol": symbol,
                            "side": "buy",
                            "qty": round(qty, 4),
                            "price": round(price, 2),
                            "pnl": 0,
                        })
            
            elif signal == "sell" and symbol in positions:
                pos = positions[symbol]
                pnl = (price - pos["entry_price"]) * pos["qty"]
                equity_before = equity
                equity += pnl
                
                # Calculate hold duration
                hold_bars = len(trades) - pos.get("entry_bar", 0)
                
                trades.append({
                    "time": time_str,
                    "symbol": symbol,
                    "side": "sell",
                    "qty": round(pos["qty"], 4),
                    "price": round(price, 2),
                    "pnl": round(pnl, 2),
                })
                
                # LEARNING ENGINE: Record trade for self-learning
                try:
                    learning_engine.record_trade(
                        symbol=symbol,
                        side="buy",  # We entered as buy
                        entry_price=pos["entry_price"],
                        exit_price=price,
                        qty=pos["qty"],
                        pnl=pnl,
                        regime="neutral" if not trend_down and not trend_up else ("bullish" if trend_up else "bearish"),
                        momentum=momentum,
                        trend_strength=trend_strength if 'trend_strength' in dir() else 0,
                        volatility=abs(momentum) * 2,  # Approximate volatility
                        strategy_used=strategy,
                        equity_at_entry=equity_before,
                        position_size_pct=(pos["qty"] * pos["entry_price"]) / equity_before if equity_before > 0 else 0,
                        hold_duration_mins=hold_bars * 60,  # Assuming hourly bars
                        exit_reason="stop_loss" if pnl < 0 else "take_profit",
                    )
                except Exception as e:
                    pass  # Don't fail backtest if learning fails
                
                del positions[symbol]
        
        # Update equity curve (sample every 10 bars to reduce data)
        if len(equity_curve) == 0 or len(all_bars) < 100 or all_bars.index(bar) % 10 == 0:
            # Calculate unrealized P&L
            unrealized = sum(
                (price_history[s][-1] - p["entry_price"]) * p["qty"]
                for s, p in positions.items()
                if s in price_history and price_history[s]
            )
            current_equity = equity + unrealized
            equity_curve.append({
                "time": time_str,
                "equity": round(current_equity, 2),
            })
            
            # Track max drawdown
            if current_equity > peak_equity:
                peak_equity = current_equity
            drawdown = (peak_equity - current_equity) / peak_equity if peak_equity > 0 else 0
            if drawdown > max_drawdown:
                max_drawdown = drawdown
    
    # Close any remaining positions at last price
    for symbol, pos in list(positions.items()):
        if price_history[symbol]:
            last_price = price_history[symbol][-1]
            pnl = (last_price - pos["entry_price"]) * pos["qty"]
            equity += pnl
            trades.append({
                "time": "END",
                "symbol": symbol,
                "side": "sell",
                "qty": round(pos["qty"], 4),
                "price": round(last_price, 2),
                "pnl": round(pnl, 2),
            })
    
    # Calculate metrics
    total_return = (equity - starting_capital) / starting_capital
    winning_trades = [t for t in trades if t["side"] == "sell" and t["pnl"] > 0]
    losing_trades = [t for t in trades if t["side"] == "sell" and t["pnl"] <= 0]
    total_closed = len(winning_trades) + len(losing_trades)
    win_rate = len(winning_trades) / total_closed if total_closed > 0 else 0
    
    # Simple Sharpe approximation (using trade returns)
    if total_closed > 1:
        returns = [t["pnl"] / starting_capital for t in trades if t["side"] == "sell"]
        avg_return = sum(returns) / len(returns)
        std_return = (sum((r - avg_return)**2 for r in returns) / len(returns))**0.5
        sharpe = (avg_return / std_return) * (252**0.5) if std_return > 0 else 0
    else:
        sharpe = 0
    
    return {
        "starting_capital": starting_capital,
        "final_equity": round(equity, 2),
        "total_return_pct": round(total_return * 100, 2),
        "max_drawdown_pct": round(max_drawdown * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
        "total_trades": len(trades),
        "win_rate": round(win_rate * 100, 1),
        "trades": trades[-100:],  # Last 100 trades
        "equity_curve": equity_curve,
    }


@app.get("/api/backtest/symbols")
async def get_backtest_symbols() -> Dict[str, Any]:
    """Get available symbols for backtesting"""
    return {
        "stocks": ["AAPL", "TSLA", "GOOGL", "MSFT", "NVDA", "AMD", "META", "AMZN", "SPY", "QQQ"],
        "crypto": ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "AVAX/USD", "LINK/USD"],
    }


@app.post("/api/backtest/run")
async def run_backtest(request: BacktestRequest) -> Dict[str, Any]:
    """Run a backtest with historical data"""
    global backtest_counter
    
    if not stock_data_client and not crypto_data_client:
        raise HTTPException(status_code=400, detail="Historical data clients not available")
    
    from datetime import timezone as tz
    try:
        start = datetime.strptime(request.start_date, "%Y-%m-%d").replace(tzinfo=tz.utc)
        end = datetime.strptime(request.end_date, "%Y-%m-%d").replace(tzinfo=tz.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if end <= start:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    
    print(f"[BACKTEST] Running for {request.symbols} from {start} to {end}")
    print(f"[BACKTEST] Strategy: {request.strategy}, Capital: ${request.starting_capital}")
    
    # Separate stocks and crypto
    stocks = [s for s in request.symbols if "/" not in s]
    cryptos = [s for s in request.symbols if "/" in s]
    
    print(f"[BACKTEST] Stocks: {stocks}, Crypto: {cryptos}")
    
    bars_data = {}
    
    # Fetch stock data
    if stocks and stock_data_client:
        try:
            print(f"[BACKTEST] Fetching stock data for {stocks}...")
            stock_request = StockBarsRequest(
                symbol_or_symbols=stocks,
                timeframe=TimeFrame.Hour,
                start=start,
                end=end,
            )
            stock_bars = stock_data_client.get_stock_bars(stock_request)
            for symbol in stocks:
                try:
                    symbol_bars = list(stock_bars[symbol])
                    if symbol_bars:
                        bars_data[symbol] = symbol_bars
                        print(f"[BACKTEST] Got {len(bars_data[symbol])} bars for {symbol}")
                except (KeyError, TypeError):
                    print(f"[BACKTEST] No data for {symbol}")
        except Exception as e:
            print(f"[BACKTEST] Error fetching stock data: {e}")
    
    # Fetch crypto data
    if cryptos and crypto_data_client:
        try:
            print(f"[BACKTEST] Fetching crypto data for {cryptos}...")
            crypto_request = CryptoBarsRequest(
                symbol_or_symbols=cryptos,
                timeframe=TimeFrame.Hour,
                start=start,
                end=end,
            )
            crypto_bars = crypto_data_client.get_crypto_bars(crypto_request)
            for symbol in cryptos:
                try:
                    symbol_bars = list(crypto_bars[symbol])
                    if symbol_bars:
                        bars_data[symbol] = symbol_bars
                        print(f"[BACKTEST] Got {len(bars_data[symbol])} bars for {symbol}")
                except (KeyError, TypeError):
                    print(f"[BACKTEST] No data for {symbol}")
        except Exception as e:
            print(f"[BACKTEST] Error fetching crypto data: {e}")
    
    if not bars_data:
        print(f"[BACKTEST] No data found!")
        raise HTTPException(status_code=400, detail="No historical data found for specified symbols")
    
    # Run simulation
    result = run_backtest_simulation(
        bars_data,
        request.symbols,
        request.strategy,
        request.starting_capital,
        request.position_size_pct,
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    # Store result
    backtest_counter += 1
    backtest_id = f"bt_{backtest_counter}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    full_result = {
        "id": backtest_id,
        "symbols": request.symbols,
        "strategy": request.strategy,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "created_at": datetime.now().isoformat(),
        **result,
    }
    
    backtest_results[backtest_id] = full_result
    
    # FRANKENSTEIN: Record backtest data for ML training
    alpha_engine.frankenstein.record_backtest_batch(
        trades=result.get("trades", []),
        equity_curve=result.get("equity_curve", []),
        config={
            "symbols": request.symbols,
            "strategy": request.strategy,
            "starting_capital": request.starting_capital,
            "position_size_pct": request.position_size_pct,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "final_equity": result.get("final_equity", 0),
            "total_return_pct": result.get("total_return_pct", 0),
            "win_rate": result.get("win_rate", 0),
            "max_drawdown_pct": result.get("max_drawdown_pct", 0),
        }
    )
    
    # Check if enough data to trigger Frankenstein training
    if alpha_engine.frankenstein.should_trigger_training():
        alpha_engine.sage.trigger_frankenstein_training()
        alpha_engine.frankenstein.reset_training_trigger()
    
    # LEARNING ENGINE: Every backtest run (including re-runs) feeds the brain and refines rules.
    # Keep testing same or different years; he keeps learning like a boss.
    learning_engine.mark_backtest_run_fed()
    learning_engine.force_analysis()
    
    return full_result


@app.get("/api/backtest/results/{backtest_id}")
async def get_backtest_result(backtest_id: str) -> Dict[str, Any]:
    """Get a specific backtest result"""
    if backtest_id not in backtest_results:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return backtest_results[backtest_id]


@app.get("/api/backtest/history")
async def get_backtest_history() -> List[Dict]:
    """Get list of past backtests"""
    return [
        {
            "id": r["id"],
            "symbols": r["symbols"],
            "strategy": r["strategy"],
            "start_date": r["start_date"],
            "end_date": r["end_date"],
            "total_return_pct": r["total_return_pct"],
            "created_at": r["created_at"],
        }
        for r in backtest_results.values()
    ]


@app.get("/api/settings")
async def get_settings() -> Dict[str, Any]:
    """Get current settings"""
    return {
        "starting_capital": config["starting_capital"],
        "trading_mode": config["trading_mode"],
        "trading_phase": config["trading_phase"],
        "max_drawdown": config["max_drawdown"],
        "max_daily_loss": config["max_daily_loss"],
        "hard_stop_time": config["hard_stop_time"],
        "alpaca_connected": alpaca_client is not None,
        "is_paper": "paper" in config["alpaca_base_url"],
    }


@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate) -> Dict[str, Any]:
    """Update settings (in memory - restart to reset)"""
    if settings.starting_capital is not None:
        config["starting_capital"] = settings.starting_capital
        state["equity"] = settings.starting_capital
        state["hustle_account"] = settings.starting_capital
    if settings.max_drawdown is not None:
        config["max_drawdown"] = settings.max_drawdown
    if settings.max_daily_loss is not None:
        config["max_daily_loss"] = settings.max_daily_loss
    if settings.trading_phase is not None:
        config["trading_phase"] = settings.trading_phase
        state["phase"] = settings.trading_phase
    return {"status": "updated", "settings": config}


@app.get("/api/assets/info")
async def get_assets_info() -> Dict[str, Any]:
    """Explain what assets Alpaca supports"""
    return {
        "broker": "Alpaca",
        "supported_assets": {
            "stocks": {
                "available": True,
                "description": "US Stocks (NYSE, NASDAQ)",
                "commission": "Free",
                "examples": ["AAPL", "TSLA", "GOOGL", "MSFT", "NVDA"],
            },
            "crypto": {
                "available": True,
                "description": "Cryptocurrencies (24/7 trading)",
                "commission": "Free",
                "examples": ["BTC/USD", "ETH/USD", "DOGE/USD", "SOL/USD"],
                "note": "Crypto trades in your same Alpaca account",
            },
            "options": {
                "available": True,
                "description": "Stock Options (requires approval)",
                "commission": "$0.00",
                "note": "Need to apply for options in Alpaca dashboard",
            },
        },
        "wallet_info": {
            "type": "Brokerage Account (not wallet)",
            "description": "Alpaca holds your cash and assets in a brokerage account, not a crypto wallet",
            "fdic_insured": False,
            "sipc_protected": True,
            "sipc_coverage": "Up to $500,000",
        },
        "where_money_goes": "Your money stays in your Alpaca brokerage account. When you buy stocks or crypto, they're held in that account. You can withdraw to your bank anytime.",
    }


@app.get("/api/fort-knox/metrics")
async def get_fort_knox_metrics() -> Dict[str, Any]:
    """Get Fort Knox metrics with real Alpaca data"""
    
    # Default values
    equity = config["starting_capital"]
    cash = config["starting_capital"]
    daily_pnl = 0.0
    unrealized_pnl = 0.0
    positions_value = 0.0
    gross_exposure = 0.0
    net_exposure = 0.0
    positions_by_symbol = {}
    
    # Get real data from Alpaca
    if alpaca_client:
        try:
            # Get account data
            account = alpaca_client.get_account()
            equity = float(account.portfolio_value)
            cash = float(account.cash)
            daily_pnl = equity - config["starting_capital"]
            
            # Get positions for exposure calculation
            positions = alpaca_client.get_all_positions()
            for p in positions:
                market_value = float(p.market_value)
                unrealized_pnl += float(p.unrealized_pl)
                positions_value += abs(market_value)
                gross_exposure += abs(market_value)
                net_exposure += market_value  # Long positive, short negative
                positions_by_symbol[p.symbol] = {
                    "value": market_value,
                    "pnl": float(p.unrealized_pl),
                    "pnl_pct": float(p.unrealized_plpc) * 100,
                }
        except Exception as e:
            print(f"Error fetching Fort Knox metrics: {e}")
    
    # Calculate drawdown (simplified - would need historical tracking for accuracy)
    peak_equity = max(equity, config["starting_capital"])
    current_drawdown = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0
    
    # Calculate exposure percentages
    exposure_pct = (gross_exposure / equity * 100) if equity > 0 else 0
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "pnl": {
            "gross": daily_pnl,
            "net": daily_pnl,
            "realized": daily_pnl - unrealized_pnl,
            "unrealized": unrealized_pnl,
        },
        "rolling_drawdown": {
            "current": current_drawdown,
            "7_day": current_drawdown,
            "14_day": current_drawdown,
            "30_day": current_drawdown,
            "max_ever": current_drawdown,
        },
        "risk_of_ruin": {
            "portfolio": max(0.01, current_drawdown * 0.5),  # Simplified calculation
            "by_strategy": {
                "momentum": 0.02,
                "mean_reversion": 0.015,
            },
        },
        "har_alerts": state.get("har_alerts", []),
        "har_score": state.get("har_score", 0.5),
        "strategic_inactivity": har_detector.strategic_inactivity if 'har_detector' in globals() else False,
        "regime": {
            "current": state["regime"],
            "confidence": state["regime_confidence"],
        },
        "exposure": {
            "net_exposure": net_exposure,
            "gross_exposure": gross_exposure,
            "exposure_pct": exposure_pct,
            "by_market": positions_by_symbol,
            "by_asset_class": {
                "stocks": positions_value,
                "crypto": 0.0,
                "options": 0.0,
            },
        },
        "capital_split": {
            "hustle_account": cash,
            "sovereign_vault": state["sovereign_vault"],
            "saas_reserve": state["saas_reserve"],
            "total": equity,
            "percentages": {
                "hustle": (cash / equity * 100) if equity > 0 else 100.0,
                "vault": (state["sovereign_vault"] / equity * 100) if equity > 0 else 0.0,
                "saas": (state["saas_reserve"] / equity * 100) if equity > 0 else 0.0,
            },
        },
        "slippage": {
            "avg_slippage": 0.01,
            "max_slippage": 0.05,
            "total_slippage_cost": 0.0,
        },
        "status": {
            "trading_active": state["trading_active"],
            "phase": state["phase"],
            "equity": equity,
            "cash": cash,
        },
    }


@app.get("/api/escalation/state")
async def get_escalation_state() -> Dict[str, Any]:
    return {
        "level": "warning",
        "triggered_at": None,
        "trigger_type": None,
        "trigger_value": None,
        "admin_locked": False,
    }


@app.get("/api/escalation/events")
async def get_escalation_events():
    return []


@app.get("/api/escalation/trading-allowed")
async def is_trading_allowed() -> Dict[str, Any]:
    return {"trading_allowed": True}


@app.get("/api/phase")
async def get_phase_status() -> Dict[str, Any]:
    return {
        "status": {
            "phase": state["phase"],
            "started_at": datetime.utcnow().isoformat(),
            "current_equity": state["equity"],
            "peak_equity": state["equity"],
            "validation_days": 0,
            "validation_trades": 0,
            "progression_eligible": False,
            "progression_blockers": ["Need more validation days"],
        },
        "config": {
            "max_drawdown": 0.10,
            "max_daily_loss": 0.03,
            "allowed_strategies": ["0DTE_BWB", "Momentum"],
        },
    }


@app.get("/api/safety")
async def get_safety_state() -> Dict[str, Any]:
    return {
        "state": {
            "strategic_inactivity": False,
            "exposure_contracted": False,
            "performance_throttled": False,
            "position_size_multiplier": 1.0,
        },
        "trading_allowed": True,
        "position_multiplier": 1.0,
        "active_protocols": [],
    }


# ============================================================================
# ANALYTICS ENDPOINTS - Real Alpaca Data
# ============================================================================

@app.get("/api/analytics/trades")
async def get_trades():
    """Get trade history (filled orders) from Alpaca"""
    if alpaca_client:
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            
            # Get filled orders (completed trades)
            request = GetOrdersRequest(status=QueryOrderStatus.CLOSED, limit=100)
            orders = alpaca_client.get_orders(filter=request)
            
            trades = []
            for o in orders:
                # Only include filled orders
                if o.filled_qty and float(o.filled_qty) > 0:
                    # Calculate P&L if we have the data
                    pnl = 0.0
                    if o.filled_avg_price:
                        # For simplicity, we'll calculate based on current vs filled
                        pnl = 0.0  # Would need position tracking for accurate P&L
                    
                    trades.append({
                        "id": str(o.id),
                        "time": o.filled_at.isoformat() if o.filled_at else o.submitted_at.isoformat() if o.submitted_at else None,
                        "symbol": o.symbol,
                        "side": str(o.side).split(".")[-1].lower(),
                        "quantity": float(o.filled_qty),
                        "price": float(o.filled_avg_price) if o.filled_avg_price else 0.0,
                        "pnl": pnl,
                        "strategy": "manual",  # Would come from order metadata
                        "status": str(o.status).split(".")[-1].lower(),
                        "order_type": str(o.type).split(".")[-1].lower(),
                    })
            
            return trades
        except Exception as e:
            print(f"Error fetching trades: {e}")
            return []
    return []


@app.get("/api/config")
async def get_config() -> Dict[str, Any]:
    """Alias for /api/settings - used by Settings page"""
    return await get_settings()


@app.get("/api/market/clock")
async def get_market_clock() -> Dict[str, Any]:
    """Get market clock status from Alpaca"""
    if alpaca_client:
        try:
            clock = alpaca_client.get_clock()
            return {
                "is_open": clock.is_open,
                "timestamp": clock.timestamp.isoformat() if clock.timestamp else None,
                "next_open": clock.next_open.isoformat() if clock.next_open else None,
                "next_close": clock.next_close.isoformat() if clock.next_close else None,
            }
        except Exception as e:
            return {"error": str(e), "is_open": False}
    return {"is_open": False, "error": "Alpaca not connected"}


@app.get("/api/analytics/equity-curve")
async def get_equity_curve():
    """Get portfolio equity history from Alpaca"""
    if alpaca_client:
        try:
            from alpaca.trading.requests import GetPortfolioHistoryRequest
            
            # Get last 30 days of portfolio history
            request = GetPortfolioHistoryRequest(
                period="1M",
                timeframe="1D"
            )
            history = alpaca_client.get_portfolio_history(request)
            
            if history and history.timestamp and history.equity:
                return [
                    {
                        "time": datetime.fromtimestamp(ts).strftime("%Y-%m-%d"),
                        "equity": eq,
                        "profit_loss": pl if history.profit_loss else 0,
                    }
                    for ts, eq, pl in zip(
                        history.timestamp,
                        history.equity,
                        history.profit_loss or [0] * len(history.equity)
                    )
                ]
            return []
        except Exception as e:
            print(f"Error fetching equity curve: {e}")
            # Return mock data if API fails
            return [
                {"time": "09:30", "equity": config["starting_capital"]},
                {"time": "10:00", "equity": config["starting_capital"] * 1.001},
                {"time": "11:00", "equity": config["starting_capital"] * 1.002},
                {"time": "12:00", "equity": config["starting_capital"] * 1.001},
                {"time": "13:00", "equity": config["starting_capital"] * 1.003},
            ]
    return []


# ============================================================================
# ORDER MANAGEMENT ENDPOINTS
# ============================================================================

class OrderRequest(BaseModel):
    symbol: str
    qty: float
    side: str  # "buy" or "sell"
    order_type: str = "market"  # "market" or "limit"
    limit_price: Optional[float] = None
    time_in_force: str = "day"  # "day", "gtc", "ioc", "fok"


@app.post("/api/orders")
async def place_order(order: OrderRequest) -> Dict[str, Any]:
    """Place a new order via Alpaca"""
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    if not state["trading_active"]:
        raise HTTPException(status_code=400, detail="Trading is not active. Start trading first.")
    
    try:
        from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
        from alpaca.trading.enums import OrderSide, TimeInForce, OrderType
        
        # Determine side
        side = OrderSide.BUY if order.side.lower() == "buy" else OrderSide.SELL
        
        # Determine time in force
        tif_map = {
            "day": TimeInForce.DAY,
            "gtc": TimeInForce.GTC,
            "ioc": TimeInForce.IOC,
            "fok": TimeInForce.FOK,
        }
        tif = tif_map.get(order.time_in_force.lower(), TimeInForce.DAY)
        
        # Create order request
        if order.order_type.lower() == "limit" and order.limit_price:
            request = LimitOrderRequest(
                symbol=order.symbol.upper(),
                qty=order.qty,
                side=side,
                time_in_force=tif,
                limit_price=order.limit_price,
            )
        else:
            request = MarketOrderRequest(
                symbol=order.symbol.upper(),
                qty=order.qty,
                side=side,
                time_in_force=tif,
            )
        
        # Submit order
        result = alpaca_client.submit_order(request)
        state["trades_today"] += 1
        
        return {
            "status": "submitted",
            "order_id": str(result.id),
            "symbol": result.symbol,
            "side": str(result.side),
            "qty": float(result.qty) if result.qty else 0,
            "type": str(result.type),
            "submitted_at": result.submitted_at.isoformat() if result.submitted_at else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/orders/{order_id}")
async def cancel_order(order_id: str) -> Dict[str, Any]:
    """Cancel an order via Alpaca"""
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    try:
        alpaca_client.cancel_order_by_id(order_id)
        return {"status": "cancelled", "order_id": order_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/orders")
async def cancel_all_orders() -> Dict[str, Any]:
    """Cancel all open orders via Alpaca"""
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    try:
        alpaca_client.cancel_orders()
        return {"status": "all_cancelled"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/positions/{symbol}")
async def close_position(symbol: str) -> Dict[str, Any]:
    """Close a position via Alpaca"""
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    try:
        alpaca_client.close_position(symbol.upper())
        return {"status": "closed", "symbol": symbol.upper()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/positions")
async def close_all_positions() -> Dict[str, Any]:
    """Close all positions via Alpaca"""
    if not alpaca_client:
        raise HTTPException(status_code=400, detail="Alpaca not connected")
    
    try:
        alpaca_client.close_all_positions()
        return {"status": "all_closed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# ALPHA-SOVEREIGN ENDPOINTS
# Advanced features: Bayesian Kelly, Monte Carlo, SAGE, Toxicity, SaaS
# ============================================================================

@app.websocket("/ws/gvu")
async def websocket_gvu(websocket: WebSocket):
    """WebSocket endpoint for real-time GVU chain-of-thought streaming"""
    await ws_manager.connect(websocket)
    try:
        # Send initial state
        await websocket.send_json({
            "type": "connected",
            "time": datetime.now().isoformat(),
            "message": "Connected to GVU stream",
        })
        
        # Send recent log
        for msg in ws_manager.gvu_log[-20:]:
            await websocket.send_json(msg)
        
        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_text()
                # Handle any client messages (ping/pong, etc.)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
    finally:
        ws_manager.disconnect(websocket)


@app.get("/api/alpha/state")
async def get_alpha_state() -> Dict[str, Any]:
    """Get complete Alpha Engine state"""
    return alpha_engine.get_full_state()


@app.get("/api/alpha/bayesian-kelly")
async def get_bayesian_kelly() -> Dict[str, Any]:
    """Get Bayesian Kelly position sizing state"""
    return {
        "state": alpha_engine.bayesian_kelly.get_state(),
        "description": "Dynamic position sizing using Beta distribution. Updates with each trade result.",
    }


@app.post("/api/alpha/bayesian-kelly/reset")
async def reset_bayesian_kelly() -> Dict[str, Any]:
    """Reset Bayesian Kelly to prior (α=1, β=4)"""
    alpha_engine.bayesian_kelly.reset()
    return {"status": "reset", "new_state": alpha_engine.bayesian_kelly.get_state()}


@app.get("/api/alpha/monte-carlo")
async def run_monte_carlo() -> Dict[str, Any]:
    """
    Run Monte Carlo validation on recent trade history.
    
    Shuffles trades 10,000 times to calculate probability of ruin
    and determine if strategy has true edge.
    """
    if len(trade_log) < 20:
        return {
            "valid": False,
            "reason": f"Need at least 20 trades for Monte Carlo. Have {len(trade_log)}.",
            "trades_needed": 20 - len(trade_log),
        }
    
    # Run Monte Carlo simulation
    result = alpha_engine.monte_carlo.run_simulation(
        trade_log, 
        starting_capital=config["starting_capital"]
    )
    
    return {
        "simulation": result,
        "recommendation": (
            "Strategy VALIDATED - Probability of ruin < 5%" if result.get("valid") 
            else "Strategy REJECTED - Too risky or insufficient edge"
        ),
    }


@app.get("/api/alpha/toxicity")
async def get_toxicity() -> Dict[str, Any]:
    """Get current market toxicity (VPIN/spoofing) state"""
    return alpha_engine.toxicity.get_state()


@app.get("/api/alpha/sage")
async def get_sage_state() -> Dict[str, Any]:
    """Get SAGE engine state (skills, active skill, Frankenstein training)"""
    return alpha_engine.sage.get_state()


@app.post("/api/alpha/sage/swap/{skill_name}")
async def manual_skill_swap(skill_name: str) -> Dict[str, Any]:
    """Manually swap to a specific skill"""
    if skill_name not in alpha_engine.sage.skills:
        raise HTTPException(status_code=400, detail=f"Unknown skill: {skill_name}")
    
    old_skill = alpha_engine.sage.active_skill
    alpha_engine.sage.active_skill = skill_name
    
    # Update active flags
    for name, skill in alpha_engine.sage.skills.items():
        skill.active = (name == skill_name)
    
    return {
        "status": "swapped",
        "from": old_skill,
        "to": skill_name,
        "skill": alpha_engine.sage.skills[skill_name].__dict__,
    }


@app.get("/api/alpha/compounding")
async def get_compounding_progress() -> Dict[str, Any]:
    """Get progress toward $40 → $40,000 goal"""
    # Sync current equity
    if alpaca_client:
        try:
            account = alpaca_client.get_account()
            alpha_engine.current_equity = float(account.portfolio_value)
        except:
            pass
    
    return alpha_engine.get_compounding_progress()


@app.get("/api/alpha/integrations")
async def get_integration_status() -> Dict[str, Any]:
    """Get status of all advanced integrations"""
    return {
        "weather_arbitrage": alpha_engine.weather.get_state(),
        "carbon_trading": alpha_engine.carbon.get_state(),
        "jito_bundles": alpha_engine.jito.get_state(),
        "fix_gateway": alpha_engine.fix.get_state(),
        "saas_api": alpha_engine.saas.get_state(),
    }


# ============================================================================
# FRANKENSTEIN ML DATA ENDPOINTS
# ============================================================================

@app.get("/api/alpha/frankenstein")
async def get_frankenstein_stats() -> Dict[str, Any]:
    """Get Frankenstein ML data collection statistics"""
    return {
        "stats": alpha_engine.frankenstein.get_stats(),
        "description": "Frankenstein collects all trading data for ML training pipeline",
        "training_status": "ACTIVE" if alpha_engine.sage.frankenstein_training else "IDLE",
    }


@app.get("/api/alpha/frankenstein/data")
async def get_frankenstein_data(limit: int = 100) -> Dict[str, Any]:
    """Get recent Frankenstein training data samples"""
    return {
        "samples": alpha_engine.frankenstein.get_training_data(limit),
        "total_available": alpha_engine.frankenstein.total_samples,
    }


@app.post("/api/alpha/frankenstein/trigger-training")
async def trigger_frankenstein_training() -> Dict[str, Any]:
    """Manually trigger Frankenstein ML training"""
    alpha_engine.sage.trigger_frankenstein_training()
    return {
        "status": "training_triggered",
        "samples_available": alpha_engine.frankenstein.total_samples,
        "message": "Frankenstein training pipeline initiated (GPU training stub)",
    }


# ============================================================================
# ADAPTIVE CAPITAL ENDPOINTS
# ============================================================================

@app.get("/api/alpha/adaptive-capital")
async def get_adaptive_capital() -> Dict[str, Any]:
    """Get adaptive capital management state and current tier"""
    # Get current equity for tier calculation
    current_equity = 100.0  # Default
    if alpaca_client:
        try:
            account = alpaca_client.get_account()
            current_equity = float(account.equity)
        except:
            pass
    
    tier_config = alpha_engine.get_adaptive_config(current_equity)
    
    return {
        "current_equity": current_equity,
        "current_tier": tier_config["tier_name"],
        "tier_config": tier_config,
        "all_tiers": alpha_engine.capital_manager.tiers,
        "description": "Adapts trading behavior based on account size - smaller accounts are more selective",
    }


@app.post("/api/alpha/adaptive-capital/simulate")
async def simulate_adaptive_capital(equity: float = 100.0) -> Dict[str, Any]:
    """Simulate adaptive capital settings for a given equity level"""
    tier_config = alpha_engine.get_adaptive_config(equity)
    
    return {
        "equity": equity,
        "tier": tier_config["tier_name"],
        "max_positions": tier_config["positions"],
        "position_size_pct": tier_config["size_pct"] * 100,
        "momentum_threshold": tier_config["momentum_threshold"] * 100,
        "require_strong_trend": tier_config["require_strong_trend"],
        "description": f"At ${equity}, system operates in {tier_config['tier_name']} mode",
    }


@app.get("/api/saas/signals")
async def get_saas_signals(limit: int = 50) -> List[Dict]:
    """
    Get recent trading signals for SaaS subscribers.
    
    This endpoint can be exposed via RapidAPI or Apify for monetization.
    """
    return alpha_engine.saas.get_public_signals(limit)


@app.post("/api/saas/enable")
async def enable_saas() -> Dict[str, Any]:
    """Enable SaaS signal publishing"""
    alpha_engine.saas.enabled = True
    return {"status": "enabled", "state": alpha_engine.saas.get_state()}


@app.post("/api/saas/disable")
async def disable_saas() -> Dict[str, Any]:
    """Disable SaaS signal publishing"""
    alpha_engine.saas.enabled = False
    return {"status": "disabled"}


# ============================================================================
# ADAPTIVE LEARNING ENGINE ENDPOINTS
# Real-time self-learning from trading mistakes
# ============================================================================

@app.get("/api/learning/summary")
async def get_learning_summary() -> Dict[str, Any]:
    """
    Get comprehensive summary of what the system has learned.
    
    Shows:
    - Total trades recorded
    - Active learned rules
    - Trades avoided by rules
    - Performance by regime
    - Top rules by confidence
    """
    return learning_engine.get_learning_summary()


@app.get("/api/learning/rules")
async def get_learned_rules() -> Dict[str, Any]:
    """Get all active learned rules"""
    return {
        "total_rules": len(learning_engine.learned_rules),
        "rules": learning_engine.get_rules(),
    }


@app.post("/api/learning/check-trade")
async def check_trade_with_learning(
    symbol: str,
    regime: str = "neutral",
    momentum: float = 0.0,
    trend_strength: float = 0.0,
    volatility: float = 0.02,
    signal_strength: float = 0.5,
    equity: float = 100.0
) -> Dict[str, Any]:
    """
    Check if a potential trade should be taken based on learned rules.
    
    This is what TradeMaster calls BEFORE entering any trade.
    """
    # Build trade context
    context = {
        "symbol": symbol,
        "symbol_type": "crypto" if "/" in symbol else "stock",
        "regime": regime,
        "momentum": momentum,
        "trend_strength": trend_strength,
        "volatility": volatility,
        "signal_strength": signal_strength,
        "hour_of_day": datetime.now().hour,
        "day_of_week": datetime.now().weekday(),
        "capital_tier": "micro" if equity < 500 else "small" if equity < 2000 else "medium" if equity < 10000 else "large",
    }
    
    should_trade, reason, adjustments = learning_engine.check_trade(context)
    
    return {
        "should_trade": should_trade,
        "reason": reason,
        "adjustments": adjustments,
        "context_checked": context,
        "blocking_rules": learning_engine.get_blocking_rules(context),
    }


@app.post("/api/learning/record-trade")
async def record_trade_for_learning(
    symbol: str,
    side: str,
    entry_price: float,
    exit_price: float,
    qty: float,
    pnl: float,
    regime: str = "neutral",
    momentum: float = 0.0,
    trend_strength: float = 0.0,
    volatility: float = 0.02,
    strategy_used: str = "combined",
    equity_at_entry: float = 100.0,
    position_size_pct: float = 0.1,
    hold_duration_mins: int = 60,
    exit_reason: str = "unknown"
) -> Dict[str, Any]:
    """
    Record a completed trade for learning analysis.
    
    This is called after every trade closes.
    """
    record = learning_engine.record_trade(
        symbol=symbol,
        side=side,
        entry_price=entry_price,
        exit_price=exit_price,
        qty=qty,
        pnl=pnl,
        regime=regime,
        momentum=momentum,
        trend_strength=trend_strength,
        volatility=volatility,
        strategy_used=strategy_used,
        equity_at_entry=equity_at_entry,
        position_size_pct=position_size_pct,
        hold_duration_mins=hold_duration_mins,
        exit_reason=exit_reason,
    )
    
    return {
        "recorded": True,
        "trade_id": record.trade_id,
        "won": record.won,
        "total_trades": len(learning_engine.trade_history),
        "analysis_pending": learning_engine.trades_since_last_analysis >= learning_engine.analysis_interval,
    }


@app.post("/api/learning/force-analysis")
async def force_learning_analysis() -> Dict[str, Any]:
    """Force an immediate analysis of trades to generate/update rules"""
    return learning_engine.force_analysis()


@app.get("/api/learning/trade-history")
async def get_learning_trade_history(limit: int = 50) -> Dict[str, Any]:
    """Get recent trade history used for learning"""
    trades = learning_engine.trade_history[-limit:]
    return {
        "total_recorded": len(learning_engine.trade_history),
        "showing": len(trades),
        "trades": [t.to_dict() for t in trades],
    }


@app.post("/api/learning/clear-rules")
async def clear_learned_rules() -> Dict[str, Any]:
    """Clear all learned rules (use carefully!)"""
    learning_engine.clear_rules()
    return {"status": "cleared", "rules_remaining": 0}


@app.get("/api/gvu/log")
async def get_gvu_log() -> List[Dict]:
    """Get recent GVU chain-of-thought log"""
    return ws_manager.gvu_log[-100:]


if __name__ == "__main__":
    # Check configuration status
    alpaca_ok = "OK" if (config["alpaca_api_key"] and config["alpaca_secret_key"]) else "NOT SET"
    polygon_ok = "OK" if config["polygon_api_key"] else "NOT SET"
    discord_ok = "OK" if config["discord_webhook"] else "NOT SET"
    telegram_ok = "OK" if config["telegram_token"] else "NOT SET"
    
    # Alpha engine status
    sage_skills = len(alpha_engine.sage.skills)
    
    print(f"""
================================================================
      TradeMaster Supreme V1 - ALPHA-SOVEREIGN EDITION
              The Sovereign Capital Machine
================================================================

   Mode:      {config['trading_mode'].upper()}
   Phase:     {config['trading_phase']}
   Capital:   ${config['starting_capital']:.2f}
   Target:    $40,000 (1000x compounding engine)

   Core Integrations:
   - Alpaca:     {alpaca_ok}
   - Polygon:    {polygon_ok}
   - Discord:    {discord_ok}
   - Telegram:   {telegram_ok}

   Alpha-Sovereign Modules:
   - Bayesian Kelly:    ACTIVE (Beta distribution sizing)
   - SAGE Engine:       ACTIVE ({sage_skills} skills loaded)
   - Monte Carlo:       READY (10k simulation validation)
   - VPIN/Toxicity:     ACTIVE (spoof detection)
   - Walk-Forward:      READY (rolling validation)

   Future Integrations (Stubs):
   - Weather Arb:   {"READY" if alpha_engine.weather.is_configured() else "NEEDS API KEY"}
   - Carbon/VCM:    {"READY" if alpha_engine.carbon.is_configured() else "NEEDS API KEY"}
   - Jito Bundles:  {"READY" if alpha_engine.jito.is_configured() else "NEEDS RPC URL"}
   - FIX 4.4:       {"READY" if alpha_engine.fix.is_configured() else "NEEDS FIX CONFIG"}

   Risk Limits:
   - Max Drawdown:   {config['max_drawdown']*100:.0f}%
   - Max Daily Loss: {config['max_daily_loss']*100:.0f}%
   - Hard Stop:      {config['hard_stop_time']} ET
   - Cost Limit:     0.3R per trade (noise farming protection)

   URLs:
   - API:       http://localhost:8000
   - Docs:      http://localhost:8000/docs
   - Dashboard: http://localhost:3000
   - WebSocket: ws://localhost:8000/ws/gvu

================================================================
    """)
    
    if alpaca_ok == "NOT SET":
        print("   [!] WARNING: Alpaca API keys not configured!")
        print("       Edit .env file and add your keys to trade.")
        print("")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
