"""
Memecoin Domination Engine - The Brain
=======================================
Orchestrates all memecoin subsystems into a unified alpha machine.

This is the core engine that:
1. Discovers tokens (Pump.fun, Raydium, DexScreener, social signals)
2. Validates safety (rug detection, honeypot checks)
3. Scores opportunities (multi-factor alpha scoring)
4. Executes trades (Jupiter aggregator for best prices)
5. Manages positions (aggressive trailing stops, ride winners)
6. Learns from results (adaptive parameter tuning)

Target: Turn $100 into $500+ daily. On a good day with a runner, $20k+.
"""

import asyncio
import os
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from tms.memecoin.solana_dex import (
    JupiterAggregator,
    RaydiumPoolMonitor,
    PumpFunMonitor,
    DexScreener,
    SolanaRPC,
)
from tms.memecoin.whale_tracker import WhaleTracker
from tms.memecoin.social_scanner import SocialSentimentEngine
from tms.memecoin.rug_detector import RugDetector, SafetyReport


# ============================================================================
# MEMECOIN POSITION TRACKER
# ============================================================================

@dataclass
class MemecoinPosition:
    """Tracks an active memecoin position with aggressive management."""
    
    token_mint: str
    token_symbol: str
    token_name: str
    
    # Entry
    entry_price: float
    entry_amount_sol: float
    entry_amount_tokens: float
    entry_time: str
    entry_reason: str
    
    # Current state
    current_price: float = 0.0
    current_value_sol: float = 0.0
    unrealized_pnl_pct: float = 0.0
    
    # Peak tracking for trailing stop
    peak_price: float = 0.0
    peak_pnl_pct: float = 0.0
    
    # Exit management
    stop_loss_pct: float = -0.25  # -25% initial stop
    trailing_stop_pct: float = 0.30  # 30% trailing from peak
    take_profit_levels: List[float] = field(default_factory=lambda: [2.0, 5.0, 10.0, 20.0, 50.0, 100.0])
    partial_exits_done: List[float] = field(default_factory=list)
    
    # Safety
    safety_score: float = 0.0
    
    # Status
    is_active: bool = True
    exit_price: float = 0.0
    exit_time: str = ""
    exit_reason: str = ""
    realized_pnl_pct: float = 0.0
    
    def update_price(self, new_price: float):
        """Update position with new price and check exit conditions."""
        self.current_price = new_price
        if self.entry_price > 0:
            self.unrealized_pnl_pct = (new_price - self.entry_price) / self.entry_price
        
        # Update peak
        if new_price > self.peak_price:
            self.peak_price = new_price
            self.peak_pnl_pct = self.unrealized_pnl_pct
        
        # Update current value
        if self.entry_price > 0:
            self.current_value_sol = self.entry_amount_sol * (1 + self.unrealized_pnl_pct)
    
    def should_exit(self) -> Tuple[bool, str]:
        """
        Check if position should be exited.
        
        Exit conditions:
        1. Stop loss hit
        2. Trailing stop from peak
        3. Adaptive trailing based on gain level
        """
        if not self.is_active:
            return False, ""
        
        # 1. Hard stop loss
        if self.unrealized_pnl_pct <= self.stop_loss_pct:
            return True, f"Stop loss: {self.unrealized_pnl_pct:.1%}"
        
        # 2. Adaptive trailing stop based on gain level
        # The more we're up, the tighter the trailing stop
        if self.peak_pnl_pct > 0:
            if self.peak_pnl_pct >= 10.0:  # 1000%+ gain
                # Very tight trailing: 15% from peak
                trail = 0.15
            elif self.peak_pnl_pct >= 5.0:  # 500%+ gain
                trail = 0.20
            elif self.peak_pnl_pct >= 2.0:  # 200%+ gain
                trail = 0.25
            elif self.peak_pnl_pct >= 1.0:  # 100%+ gain
                trail = 0.30
            elif self.peak_pnl_pct >= 0.5:  # 50%+ gain
                trail = 0.35
            else:
                trail = self.trailing_stop_pct
            
            drawdown_from_peak = (self.peak_price - self.current_price) / self.peak_price if self.peak_price > 0 else 0
            if drawdown_from_peak >= trail:
                return True, f"Trailing stop: {drawdown_from_peak:.1%} from peak (trail={trail:.0%})"
        
        return False, ""
    
    def get_partial_exit_level(self) -> Optional[float]:
        """
        Check if we should take partial profits.
        
        Strategy: Take 20% off at each level to lock in gains
        while letting the rest ride for maximum upside.
        """
        for level in self.take_profit_levels:
            if self.unrealized_pnl_pct >= level and level not in self.partial_exits_done:
                return level
        return None
    
    def to_dict(self) -> Dict:
        return {
            "token_mint": self.token_mint,
            "token_symbol": self.token_symbol,
            "token_name": self.token_name,
            "entry_price": self.entry_price,
            "entry_amount_sol": self.entry_amount_sol,
            "current_price": self.current_price,
            "unrealized_pnl_pct": self.unrealized_pnl_pct,
            "peak_pnl_pct": self.peak_pnl_pct,
            "current_value_sol": self.current_value_sol,
            "safety_score": self.safety_score,
            "is_active": self.is_active,
            "entry_time": self.entry_time,
            "entry_reason": self.entry_reason,
            "partial_exits_done": self.partial_exits_done,
        }


# ============================================================================
# ALPHA SCORING ENGINE
# ============================================================================

class AlphaScorer:
    """
    Multi-factor alpha scoring for memecoin opportunities.
    
    Combines signals from:
    - On-chain data (liquidity, holders, volume)
    - Social sentiment (Twitter, Telegram, Reddit)
    - Whale activity (smart money following)
    - Technical momentum (price action)
    - Token safety (rug detection score)
    
    Score range: 0-100
    Trade threshold: 60+
    """

    # Weight configuration
    WEIGHTS = {
        "social_sentiment": 0.20,
        "whale_signal": 0.25,
        "momentum": 0.15,
        "liquidity_quality": 0.10,
        "safety_score": 0.15,
        "volume_surge": 0.10,
        "bonding_curve": 0.05,
    }

    def score_opportunity(
        self,
        token_data: Dict,
        social_score: float = 0,
        whale_signal: Optional[Dict] = None,
        safety_report: Optional[SafetyReport] = None,
        price_data: List[Dict] = None,
    ) -> Dict:
        """
        Calculate comprehensive alpha score for a token opportunity.
        
        Returns dict with total score and component breakdown.
        """
        scores = {}
        
        # 1. Social sentiment (0-100)
        scores["social_sentiment"] = min(100, social_score)
        
        # 2. Whale signal (0-100)
        if whale_signal:
            scores["whale_signal"] = whale_signal.get("confidence", 0) * 100
        else:
            scores["whale_signal"] = 0
        
        # 3. Momentum (0-100)
        if price_data and len(price_data) >= 2:
            recent_price = price_data[-1].get("close", 0)
            older_price = price_data[0].get("close", 0)
            if older_price > 0:
                momentum = (recent_price - older_price) / older_price
                # Positive momentum is good, but not too extreme (could be pump & dump)
                if 0 < momentum < 0.5:
                    scores["momentum"] = min(100, momentum * 200)
                elif momentum >= 0.5:
                    scores["momentum"] = max(30, 100 - (momentum - 0.5) * 100)  # Penalize extreme pumps
                else:
                    scores["momentum"] = max(0, 50 + momentum * 100)  # Slight negative ok
            else:
                scores["momentum"] = 0
        else:
            scores["momentum"] = 30  # Neutral if no data
        
        # 4. Liquidity quality (0-100)
        liquidity = token_data.get("liquidity_usd", 0)
        if liquidity >= 100000:
            scores["liquidity_quality"] = 100
        elif liquidity >= 50000:
            scores["liquidity_quality"] = 80
        elif liquidity >= 20000:
            scores["liquidity_quality"] = 60
        elif liquidity >= 10000:
            scores["liquidity_quality"] = 40
        elif liquidity >= 5000:
            scores["liquidity_quality"] = 20
        else:
            scores["liquidity_quality"] = 0
        
        # 5. Safety score (0-100)
        if safety_report:
            scores["safety_score"] = safety_report.safety_score
        else:
            scores["safety_score"] = 30  # Unknown = risky
        
        # 6. Volume surge (0-100)
        volume_24h = token_data.get("volume_24h", 0)
        volume_change = token_data.get("volume_change_pct", 0)
        if volume_change > 500:
            scores["volume_surge"] = 100
        elif volume_change > 200:
            scores["volume_surge"] = 80
        elif volume_change > 100:
            scores["volume_surge"] = 60
        elif volume_change > 50:
            scores["volume_surge"] = 40
        else:
            scores["volume_surge"] = max(0, min(40, volume_24h / 1000))
        
        # 7. Bonding curve position (0-100, only for Pump.fun tokens)
        curve_progress = token_data.get("bonding_curve_progress", -1)
        if curve_progress >= 0:
            if curve_progress < 20:
                scores["bonding_curve"] = 100  # Very early = max score
            elif curve_progress < 40:
                scores["bonding_curve"] = 80
            elif curve_progress < 60:
                scores["bonding_curve"] = 50
            elif curve_progress < 80:
                scores["bonding_curve"] = 30
            else:
                scores["bonding_curve"] = 10
        else:
            scores["bonding_curve"] = 50  # Not a pump.fun token, neutral
        
        # Calculate weighted total
        total = sum(
            scores.get(key, 0) * weight
            for key, weight in self.WEIGHTS.items()
        )
        
        return {
            "total_score": round(total, 1),
            "is_tradeable": total >= 60 and (safety_report is None or safety_report.is_safe),
            "components": scores,
            "weights": self.WEIGHTS,
            "recommendation": self._get_recommendation(total),
        }

    def _get_recommendation(self, score: float) -> str:
        if score >= 85:
            return "STRONG BUY -- High conviction, max position"
        elif score >= 70:
            return "BUY -- Good setup, standard position"
        elif score >= 60:
            return "SPECULATIVE BUY -- Smaller position, tight stop"
        elif score >= 40:
            return "WATCH -- Not enough conviction yet"
        else:
            return "SKIP -- Too risky or no edge"


# ============================================================================
# POSITION SIZING FOR MEMECOINS
# ============================================================================

class MemecoinPositionSizer:
    """
    Aggressive but controlled position sizing for memecoins.
    
    Key principles:
    - Never risk more than you can afford to lose
    - Size based on conviction (alpha score)
    - Scale into winners, cut losers fast
    - Keep dry powder for the next opportunity
    """

    def __init__(self):
        # Base allocation per trade as % of portfolio
        self.base_allocation_pct = 0.05  # 5% base
        self.max_allocation_pct = 0.15   # 15% max per trade
        self.max_portfolio_in_memes = 0.80  # 80% max in memecoins total
        self.max_positions = 8
        
        # Conviction multipliers
        self.conviction_multipliers = {
            "STRONG BUY": 3.0,   # 15% position
            "BUY": 2.0,          # 10% position
            "SPECULATIVE BUY": 1.0,  # 5% position
        }

    def calculate_position_size(
        self,
        portfolio_value_sol: float,
        alpha_score: float,
        recommendation: str,
        current_positions: int,
        current_exposure_pct: float,
    ) -> Dict:
        """
        Calculate optimal position size for a memecoin trade.
        
        Returns:
            Dict with size in SOL, percentage, and reasoning
        """
        # Check if we can take more positions
        if current_positions >= self.max_positions:
            return {
                "size_sol": 0,
                "size_pct": 0,
                "reason": f"Max positions ({self.max_positions}) reached",
                "can_trade": False,
            }
        
        # Check total exposure
        remaining_capacity = self.max_portfolio_in_memes - current_exposure_pct
        if remaining_capacity <= 0.02:  # Less than 2% remaining
            return {
                "size_sol": 0,
                "size_pct": 0,
                "reason": f"Max memecoin exposure ({self.max_portfolio_in_memes:.0%}) reached",
                "can_trade": False,
            }
        
        # Base size
        multiplier = self.conviction_multipliers.get(recommendation, 1.0)
        size_pct = min(
            self.base_allocation_pct * multiplier,
            self.max_allocation_pct,
            remaining_capacity,
        )
        
        # Score-based adjustment
        if alpha_score >= 85:
            size_pct *= 1.2  # 20% bonus for very high scores
        elif alpha_score < 65:
            size_pct *= 0.7  # 30% reduction for marginal scores
        
        # Cap at max
        size_pct = min(size_pct, self.max_allocation_pct)
        size_sol = portfolio_value_sol * size_pct
        
        # Minimum trade size (need enough to cover fees)
        min_size_sol = 0.01  # ~$1.50 minimum
        if size_sol < min_size_sol:
            return {
                "size_sol": 0,
                "size_pct": 0,
                "reason": f"Position too small: {size_sol:.4f} SOL < {min_size_sol} SOL minimum",
                "can_trade": False,
            }
        
        return {
            "size_sol": round(size_sol, 4),
            "size_pct": size_pct,
            "reason": f"{recommendation}: {size_pct:.1%} of portfolio ({size_sol:.4f} SOL)",
            "can_trade": True,
            "multiplier": multiplier,
            "alpha_score": alpha_score,
        }


# ============================================================================
# MEMECOIN DOMINATION ENGINE - THE BRAIN
# ============================================================================

class MemecoinEngine:
    """
    The ultimate memecoin trading engine.
    
    Orchestrates all subsystems:
    - Token discovery (Pump.fun, Raydium, DexScreener)
    - Safety validation (rug detection)
    - Alpha scoring (multi-factor)
    - Position sizing (conviction-based)
    - Trade execution (Jupiter aggregator)
    - Position management (adaptive trailing stops)
    - Performance tracking and learning
    
    Scan cycle: Every 3 seconds for maximum speed.
    """

    def __init__(
        self,
        solana_rpc_url: str = "",
        solana_wallet_pubkey: str = "",
        helius_api_key: str = "",
        birdeye_api_key: str = "",
        twitter_bearer: str = "",
        telegram_token: str = "",
    ):
        # Core components
        self.rpc = SolanaRPC(solana_rpc_url) if solana_rpc_url else SolanaRPC()
        self.jupiter = JupiterAggregator(solana_rpc_url)
        self.raydium = RaydiumPoolMonitor(self.rpc)
        self.pump_fun = PumpFunMonitor()
        self.dex_screener = DexScreener()
        self.whale_tracker = WhaleTracker(helius_api_key, birdeye_api_key)
        self.social_scanner = SocialSentimentEngine(twitter_bearer, telegram_token)
        self.rug_detector = RugDetector(self.dex_screener)
        self.alpha_scorer = AlphaScorer()
        self.position_sizer = MemecoinPositionSizer()
        
        # Wallet
        self.wallet_pubkey = solana_wallet_pubkey
        
        # State
        self.active = False
        self.cycle_count = 0
        self.portfolio_value_sol = 0.0
        self.starting_value_sol = 0.0
        
        # Positions
        self.positions: Dict[str, MemecoinPosition] = {}
        self.closed_positions: List[MemecoinPosition] = []
        
        # Watchlist (tokens being monitored but not yet traded)
        self.watchlist: Dict[str, Dict] = {}
        
        # Performance
        self.total_trades = 0
        self.winning_trades = 0
        self.total_pnl_sol = 0.0
        self.best_trade_pnl_pct = 0.0
        self.worst_trade_pnl_pct = 0.0
        self.daily_pnl_sol = 0.0
        
        # Scan results
        self.last_scan_results: Dict = {}
        self.opportunities: List[Dict] = []
        
        # Configuration
        self.scan_interval_seconds = 3  # Scan every 3 seconds
        self.social_scan_interval = 60  # Social scan every 60 seconds
        self.whale_scan_interval = 30   # Whale scan every 30 seconds
        self.min_alpha_score = 60       # Minimum score to trade
        self.auto_trade = False         # Manual approval by default
        
        # Callbacks for WebSocket broadcasting
        self._on_signal = None
        self._on_trade = None
        self._on_state_update = None

    def set_callbacks(self, on_signal=None, on_trade=None, on_state_update=None):
        """Set callback functions for real-time updates."""
        self._on_signal = on_signal
        self._on_trade = on_trade
        self._on_state_update = on_state_update

    async def initialize(self):
        """Initialize the engine and all subsystems."""
        # Get wallet balance
        if self.wallet_pubkey:
            self.portfolio_value_sol = await self.rpc.get_balance(self.wallet_pubkey)
            self.starting_value_sol = self.portfolio_value_sol
        
        self.active = True
        print(f"[MEMECOIN ENGINE] Initialized")
        print(f"  Wallet: {self.wallet_pubkey[:8]}...{self.wallet_pubkey[-4:]}" if self.wallet_pubkey else "  Wallet: Not configured")
        print(f"  Balance: {self.portfolio_value_sol:.4f} SOL")
        print(f"  Scan interval: {self.scan_interval_seconds}s")

    async def run_discovery_cycle(self) -> List[Dict]:
        """
        Run one discovery cycle to find new opportunities.
        
        Pipeline:
        1. Scan Pump.fun for new tokens
        2. Scan Raydium for new pools
        3. Check DexScreener for trending tokens
        4. Check whale activity
        5. Check social signals
        6. Score all opportunities
        7. Filter by safety
        """
        self.cycle_count += 1
        opportunities = []
        
        # 1. Pump.fun new tokens
        try:
            new_tokens = await self.pump_fun.get_new_tokens(limit=20)
            for token in new_tokens[:10]:  # Analyze top 10
                analysis = await self.pump_fun.analyze_token_for_snipe(token)
                if analysis.get("snipe_worthy"):
                    opportunities.append({
                        "source": "pump_fun",
                        "mint": analysis["mint"],
                        "name": analysis["name"],
                        "symbol": analysis["symbol"],
                        "score": analysis["score"],
                        "market_cap": analysis.get("market_cap", 0),
                        "reasons": analysis.get("reasons", []),
                        "bonding_curve_progress": analysis.get("bonding_curve", {}).get("progress_pct", 0),
                    })
        except Exception as e:
            print(f"[MEMECOIN] Pump.fun scan error: {e}")
        
        # 2. DexScreener trending
        try:
            trending = await self.dex_screener.get_trending_tokens("solana")
            for token in trending[:10]:
                mint = token.get("tokenAddress", "")
                if mint and mint not in self.positions:
                    opportunities.append({
                        "source": "dexscreener_trending",
                        "mint": mint,
                        "name": token.get("description", ""),
                        "symbol": token.get("symbol", ""),
                        "score": 50,  # Base score, will be refined
                    })
        except Exception as e:
            print(f"[MEMECOIN] DexScreener scan error: {e}")
        
        # 3. Whale signals (less frequent)
        if self.cycle_count % (self.whale_scan_interval // self.scan_interval_seconds) == 0:
            try:
                whale_signals = await self.whale_tracker.generate_copy_signals()
                for signal in whale_signals:
                    if signal["action"] == "buy":
                        opportunities.append({
                            "source": "whale_copy",
                            "mint": signal["token_mint"],
                            "name": "",
                            "symbol": "",
                            "score": signal["confidence"] * 100,
                            "whale_address": signal["whale_address"],
                            "whale_trust": signal["whale_trust_score"],
                        })
            except Exception as e:
                print(f"[MEMECOIN] Whale scan error: {e}")
        
        # 4. Social signals (less frequent)
        if self.cycle_count % (self.social_scan_interval // self.scan_interval_seconds) == 0:
            try:
                social_scores = await self.social_scanner.full_scan()
                for token, data in social_scores.items():
                    if data["aggregated_strength"] >= 50 and data.get("mint"):
                        opportunities.append({
                            "source": "social_signal",
                            "mint": data["mint"],
                            "name": token,
                            "symbol": token,
                            "score": data["aggregated_strength"],
                            "social_mentions": data["total_mentions"],
                            "social_sources": data["sources"],
                        })
            except Exception as e:
                print(f"[MEMECOIN] Social scan error: {e}")
        
        # 5. Score and filter opportunities
        scored_opportunities = []
        for opp in opportunities:
            mint = opp.get("mint", "")
            if not mint or mint in self.positions:
                continue
            
            # Safety check
            try:
                safety = await self.rug_detector.analyze_token(
                    mint, opp.get("name", ""), opp.get("symbol", "")
                )
                if not safety.is_safe:
                    continue
                
                # Get price data for momentum scoring
                price_data = []
                if self.whale_tracker.birdeye.api_key:
                    try:
                        ohlcv = await self.whale_tracker.birdeye.get_ohlcv(mint, "5m", 20)
                        price_data = ohlcv
                    except Exception:
                        pass
                
                # Full alpha scoring
                token_data = {
                    "liquidity_usd": safety.liquidity_usd,
                    "volume_24h": opp.get("volume_24h", 0),
                    "volume_change_pct": opp.get("volume_change_pct", 0),
                    "bonding_curve_progress": opp.get("bonding_curve_progress", -1),
                }
                
                whale_signal = None
                if opp["source"] == "whale_copy":
                    whale_signal = {
                        "confidence": opp.get("whale_trust", 0) / 100,
                    }
                
                social_score = opp.get("score", 0) if opp["source"] == "social_signal" else 0
                
                alpha = self.alpha_scorer.score_opportunity(
                    token_data=token_data,
                    social_score=social_score,
                    whale_signal=whale_signal,
                    safety_report=safety,
                    price_data=price_data,
                )
                
                opp["alpha_score"] = alpha["total_score"]
                opp["alpha_components"] = alpha["components"]
                opp["recommendation"] = alpha["recommendation"]
                opp["is_tradeable"] = alpha["is_tradeable"]
                opp["safety_score"] = safety.safety_score
                opp["safety_report"] = safety.to_dict()
                
                if alpha["is_tradeable"]:
                    scored_opportunities.append(opp)
                    
            except Exception as e:
                print(f"[MEMECOIN] Scoring error for {mint[:8]}: {e}")
                continue
        
        # Sort by alpha score
        scored_opportunities.sort(key=lambda x: x.get("alpha_score", 0), reverse=True)
        
        self.opportunities = scored_opportunities
        self.last_scan_results = {
            "cycle": self.cycle_count,
            "total_scanned": len(opportunities),
            "passed_safety": len(scored_opportunities),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        return scored_opportunities

    async def execute_buy(
        self,
        mint: str,
        name: str,
        symbol: str,
        amount_sol: float,
        reason: str,
        safety_score: float = 0,
    ) -> Dict:
        """
        Execute a buy order for a memecoin via Jupiter.
        
        Returns execution result with transaction details.
        """
        if not self.wallet_pubkey:
            return {"success": False, "error": "Wallet not configured"}
        
        # Convert SOL to lamports
        amount_lamports = int(amount_sol * 1e9)
        
        # Get swap quote and transaction
        result = await self.jupiter.execute_swap(
            input_mint=JupiterAggregator.SOL_MINT,
            output_mint=mint,
            amount_lamports=amount_lamports,
            user_public_key=self.wallet_pubkey,
            slippage_bps=200,  # 2% slippage for memecoins
            priority_fee=300000,  # Higher priority for speed
        )
        
        if not result["success"]:
            return result
        
        # Get entry price
        entry_price = await self.jupiter.get_token_price(mint)
        if not entry_price:
            entry_price = 0.0
        
        # Create position
        position = MemecoinPosition(
            token_mint=mint,
            token_symbol=symbol,
            token_name=name,
            entry_price=entry_price,
            entry_amount_sol=amount_sol,
            entry_amount_tokens=result.get("out_amount", 0),
            entry_time=datetime.now(timezone.utc).isoformat(),
            entry_reason=reason,
            current_price=entry_price,
            peak_price=entry_price,
            safety_score=safety_score,
        )
        
        self.positions[mint] = position
        self.total_trades += 1
        
        if self._on_trade:
            await self._on_trade({
                "type": "buy",
                "mint": mint,
                "symbol": symbol,
                "amount_sol": amount_sol,
                "entry_price": entry_price,
                "reason": reason,
            })
        
        return {
            "success": True,
            "position": position.to_dict(),
            "transaction": result.get("transaction"),
            "price_impact": result.get("price_impact_pct"),
        }

    async def execute_sell(
        self,
        mint: str,
        sell_pct: float = 1.0,  # 1.0 = sell all, 0.5 = sell half
        reason: str = "",
    ) -> Dict:
        """
        Execute a sell order for a memecoin position.
        
        Args:
            mint: Token mint address
            sell_pct: Percentage of position to sell (0-1)
            reason: Why we're selling
        """
        if mint not in self.positions:
            return {"success": False, "error": "No position found"}
        
        position = self.positions[mint]
        
        # Calculate amount to sell
        sell_amount = int(position.entry_amount_tokens * sell_pct)
        
        if sell_amount <= 0:
            return {"success": False, "error": "Nothing to sell"}
        
        # Execute swap: token -> SOL
        result = await self.jupiter.execute_swap(
            input_mint=mint,
            output_mint=JupiterAggregator.SOL_MINT,
            amount_lamports=sell_amount,
            user_public_key=self.wallet_pubkey,
            slippage_bps=300,  # 3% slippage for sells (memecoins can be illiquid)
            priority_fee=300000,
        )
        
        if not result["success"]:
            return result
        
        # Update position
        if sell_pct >= 0.99:
            # Full exit
            position.is_active = False
            position.exit_time = datetime.now(timezone.utc).isoformat()
            position.exit_reason = reason
            position.exit_price = position.current_price
            position.realized_pnl_pct = position.unrealized_pnl_pct
            
            # Track performance
            if position.realized_pnl_pct > 0:
                self.winning_trades += 1
            
            pnl_sol = position.entry_amount_sol * position.realized_pnl_pct
            self.total_pnl_sol += pnl_sol
            self.daily_pnl_sol += pnl_sol
            
            if position.realized_pnl_pct > self.best_trade_pnl_pct:
                self.best_trade_pnl_pct = position.realized_pnl_pct
            if position.realized_pnl_pct < self.worst_trade_pnl_pct:
                self.worst_trade_pnl_pct = position.realized_pnl_pct
            
            self.closed_positions.append(position)
            del self.positions[mint]
        else:
            # Partial exit
            position.partial_exits_done.append(position.unrealized_pnl_pct)
            position.entry_amount_tokens = int(position.entry_amount_tokens * (1 - sell_pct))
            position.entry_amount_sol *= (1 - sell_pct)
        
        if self._on_trade:
            await self._on_trade({
                "type": "sell",
                "mint": mint,
                "symbol": position.token_symbol,
                "sell_pct": sell_pct,
                "pnl_pct": position.unrealized_pnl_pct,
                "reason": reason,
            })
        
        return {
            "success": True,
            "sell_pct": sell_pct,
            "pnl_pct": position.unrealized_pnl_pct if position.is_active else position.realized_pnl_pct,
            "reason": reason,
        }

    async def manage_positions(self):
        """
        Active position management loop.
        
        For each position:
        1. Update price
        2. Check exit conditions
        3. Check partial profit levels
        4. Execute exits as needed
        """
        for mint, position in list(self.positions.items()):
            if not position.is_active:
                continue
            
            # Update price
            price = await self.jupiter.get_token_price(mint)
            if price:
                position.update_price(price)
            
            # Check full exit
            should_exit, exit_reason = position.should_exit()
            if should_exit:
                await self.execute_sell(mint, 1.0, exit_reason)
                continue
            
            # Check partial profit taking
            partial_level = position.get_partial_exit_level()
            if partial_level is not None:
                # Take 20% off at each level
                await self.execute_sell(
                    mint, 0.20,
                    f"Partial profit at {partial_level:.0%} gain"
                )

    async def run_engine_loop(self):
        """
        Main engine loop. Runs continuously.
        
        Every 3 seconds:
        1. Manage existing positions
        2. Discover new opportunities
        3. Execute trades if auto_trade is on
        """
        await self.initialize()
        
        social_counter = 0
        
        while self.active:
            try:
                # 1. Manage positions (every cycle)
                await self.manage_positions()
                
                # 2. Discover opportunities
                opportunities = await self.run_discovery_cycle()
                
                # 3. Auto-trade if enabled
                if self.auto_trade and opportunities:
                    for opp in opportunities[:3]:  # Max 3 trades per cycle
                        if len(self.positions) >= self.position_sizer.max_positions:
                            break
                        
                        # Calculate position size
                        current_exposure = sum(
                            p.entry_amount_sol for p in self.positions.values()
                        ) / max(0.01, self.portfolio_value_sol)
                        
                        sizing = self.position_sizer.calculate_position_size(
                            portfolio_value_sol=self.portfolio_value_sol,
                            alpha_score=opp.get("alpha_score", 0),
                            recommendation=opp.get("recommendation", "WATCH"),
                            current_positions=len(self.positions),
                            current_exposure_pct=current_exposure,
                        )
                        
                        if sizing["can_trade"]:
                            await self.execute_buy(
                                mint=opp["mint"],
                                name=opp.get("name", ""),
                                symbol=opp.get("symbol", ""),
                                amount_sol=sizing["size_sol"],
                                reason=f"{opp['source']}: {opp.get('recommendation', '')}",
                                safety_score=opp.get("safety_score", 0),
                            )
                
                # 4. Update portfolio value
                if self.wallet_pubkey:
                    try:
                        self.portfolio_value_sol = await self.rpc.get_balance(self.wallet_pubkey)
                    except Exception:
                        pass
                
                # 5. Broadcast state
                if self._on_state_update:
                    await self._on_state_update(self.get_state())
                
                await asyncio.sleep(self.scan_interval_seconds)
                
            except Exception as e:
                print(f"[MEMECOIN ENGINE] Error in main loop: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)

    def get_state(self) -> Dict:
        """Get complete engine state for dashboard."""
        win_rate = self.winning_trades / max(1, self.total_trades)
        
        return {
            "active": self.active,
            "auto_trade": self.auto_trade,
            "cycle_count": self.cycle_count,
            
            # Portfolio
            "portfolio_value_sol": self.portfolio_value_sol,
            "starting_value_sol": self.starting_value_sol,
            "total_pnl_sol": self.total_pnl_sol,
            "daily_pnl_sol": self.daily_pnl_sol,
            "total_return_pct": (
                (self.portfolio_value_sol - self.starting_value_sol) / self.starting_value_sol * 100
                if self.starting_value_sol > 0 else 0
            ),
            
            # Performance
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "win_rate": win_rate,
            "best_trade_pnl_pct": self.best_trade_pnl_pct,
            "worst_trade_pnl_pct": self.worst_trade_pnl_pct,
            
            # Positions
            "active_positions": len(self.positions),
            "positions": [p.to_dict() for p in self.positions.values()],
            "closed_positions_count": len(self.closed_positions),
            
            # Opportunities
            "opportunities": self.opportunities[:10],
            "last_scan": self.last_scan_results,
            
            # Subsystems
            "whale_tracker": self.whale_tracker.get_state(),
            "social_scanner": self.social_scanner.get_state(),
            "rug_detector": self.rug_detector.get_state(),
            
            # Watchlist
            "watchlist_count": len(self.watchlist),
        }

    async def shutdown(self):
        """Gracefully shutdown the engine."""
        self.active = False
        
        # Close all positions if configured
        for mint in list(self.positions.keys()):
            await self.execute_sell(mint, 1.0, "Engine shutdown")
        
        # Close all connections
        await self.jupiter.close()
        await self.raydium.close()
        await self.pump_fun.close()
        await self.dex_screener.close()
        await self.whale_tracker.close()
        await self.social_scanner.close()
        await self.rug_detector.close()
        await self.rpc.close()
