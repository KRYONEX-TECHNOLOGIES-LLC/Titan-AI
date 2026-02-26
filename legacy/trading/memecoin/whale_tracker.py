"""
Whale Wallet Tracker - Follow Smart Money On-Chain
===================================================
Tracks known profitable wallets on Solana and mirrors their trades.
The fastest way to find alpha: follow the wallets that already have it.
"""

import asyncio
import aiohttp
import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field


# ============================================================================
# KNOWN PROFITABLE WALLETS (Curated list of smart money)
# ============================================================================

# These are publicly known wallets that consistently profit on memecoins.
# The system will discover more through on-chain analysis.
SEED_WHALE_WALLETS = [
    # Format: (address, label, avg_roi_multiplier)
    # These are example addresses -- real ones should be discovered through
    # on-chain analysis of top PnL wallets on Solana memecoin trades.
]


@dataclass
class WalletProfile:
    """Profile of a tracked wallet with performance metrics."""
    address: str
    label: str = ""
    
    # Performance metrics
    total_trades: int = 0
    winning_trades: int = 0
    total_pnl_sol: float = 0.0
    avg_roi: float = 0.0
    best_trade_roi: float = 0.0
    
    # Timing metrics
    avg_hold_time_minutes: float = 0.0
    first_seen: str = ""
    last_active: str = ""
    
    # Token preferences
    tokens_traded: List[str] = field(default_factory=list)
    preferred_mcap_range: Tuple[float, float] = (0, 0)
    
    # Trust score (0-100)
    trust_score: float = 50.0
    
    # Recent activity
    recent_buys: List[Dict] = field(default_factory=list)
    recent_sells: List[Dict] = field(default_factory=list)
    
    @property
    def win_rate(self) -> float:
        if self.total_trades == 0:
            return 0.0
        return self.winning_trades / self.total_trades
    
    def update_trust_score(self):
        """Recalculate trust score based on performance."""
        score = 50.0  # Base
        
        # Win rate contribution (max +25)
        if self.total_trades >= 10:
            score += (self.win_rate - 0.5) * 50  # +25 at 100% WR, -25 at 0%
        
        # ROI contribution (max +15)
        if self.avg_roi > 2.0:
            score += 15
        elif self.avg_roi > 1.0:
            score += 10
        elif self.avg_roi > 0.5:
            score += 5
        
        # Activity contribution (max +10)
        if self.total_trades >= 50:
            score += 10
        elif self.total_trades >= 20:
            score += 5
        
        self.trust_score = max(0, min(100, score))


# ============================================================================
# HELIUS API CLIENT - Solana's best transaction parser
# ============================================================================

class HeliusClient:
    """
    Helius API for parsed Solana transactions.
    Helius provides human-readable transaction parsing,
    making it easy to detect swaps, transfers, and NFT trades.
    """

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.base_url = f"https://api.helius.xyz/v0"
        self.session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def get_parsed_transactions(
        self, address: str, limit: int = 100
    ) -> List[Dict]:
        """Get parsed transactions for a wallet."""
        if not self.api_key:
            return []
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.base_url}/addresses/{address}/transactions",
                params={"api-key": self.api_key, "limit": limit},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                return []
        except Exception as e:
            print(f"[HELIUS] Error: {e}")
            return []

    async def get_token_metadata(self, mint: str) -> Optional[Dict]:
        """Get token metadata from Helius."""
        if not self.api_key:
            return None
        await self._ensure_session()
        try:
            async with self.session.post(
                f"{self.base_url}/token-metadata",
                params={"api-key": self.api_key},
                json={"mintAccounts": [mint], "includeOffChain": True},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data[0] if data else None
                return None
        except Exception:
            return None

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# BIRDEYE API CLIENT - Token analytics and wallet tracking
# ============================================================================

class BirdeyeClient:
    """
    Birdeye API for Solana token analytics.
    Provides OHLCV data, wallet PnL, and token security info.
    """

    BASE_URL = "https://public-api.birdeye.so"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            headers = {}
            if self.api_key:
                headers["X-API-KEY"] = self.api_key
            self.session = aiohttp.ClientSession(headers=headers)

    async def get_token_overview(self, mint: str) -> Optional[Dict]:
        """Get comprehensive token overview."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/defi/token_overview",
                params={"address": mint},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data")
                return None
        except Exception:
            return None

    async def get_token_security(self, mint: str) -> Optional[Dict]:
        """Get token security analysis (rug pull detection)."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/defi/token_security",
                params={"address": mint},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data")
                return None
        except Exception:
            return None

    async def get_ohlcv(
        self, mint: str, timeframe: str = "15m", limit: int = 100
    ) -> List[Dict]:
        """Get OHLCV candle data for a token."""
        await self._ensure_session()
        tf_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1H", "4h": "4H", "1d": "1D",
        }
        try:
            async with self.session.get(
                f"{self.BASE_URL}/defi/ohlcv",
                params={
                    "address": mint,
                    "type": tf_map.get(timeframe, "15m"),
                    "time_from": int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp()),
                    "time_to": int(datetime.now(timezone.utc).timestamp()),
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data", {}).get("items", [])
                return []
        except Exception:
            return []

    async def get_top_traders(self, mint: str, limit: int = 20) -> List[Dict]:
        """Get top traders for a specific token."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/defi/v2/tokens/top_traders",
                params={"address": mint, "limit": limit},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data", {}).get("items", [])
                return []
        except Exception:
            return []

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# WHALE TRACKER ENGINE
# ============================================================================

class WhaleTracker:
    """
    Core whale tracking engine.
    
    Monitors smart money wallets and generates copy-trade signals.
    
    Pipeline:
    1. Discover profitable wallets from on-chain data
    2. Monitor their transactions in real-time
    3. When a whale buys a new token, analyze it
    4. If it passes safety checks, generate a buy signal
    5. When the whale sells, generate a sell signal
    """

    def __init__(
        self,
        helius_api_key: str = "",
        birdeye_api_key: str = "",
    ):
        self.helius = HeliusClient(helius_api_key)
        self.birdeye = BirdeyeClient(birdeye_api_key)
        self.wallets: Dict[str, WalletProfile] = {}
        self.signals: List[Dict] = []
        self.active = False
        
        # Configuration
        self.min_trust_score = 60.0
        self.min_wallet_trades = 10
        self.max_copy_delay_seconds = 30
        self.max_position_per_signal = 0.10  # 10% of portfolio per whale signal
        
        # Stats
        self.signals_generated = 0
        self.signals_profitable = 0
        self.total_wallets_tracked = 0

    def add_wallet(self, address: str, label: str = "") -> WalletProfile:
        """Add a wallet to track."""
        if address not in self.wallets:
            profile = WalletProfile(
                address=address,
                label=label,
                first_seen=datetime.now(timezone.utc).isoformat(),
            )
            self.wallets[address] = profile
            self.total_wallets_tracked += 1
        return self.wallets[address]

    def remove_wallet(self, address: str):
        """Stop tracking a wallet."""
        self.wallets.pop(address, None)

    async def discover_whales_from_token(self, mint: str, min_pnl: float = 1.0) -> List[str]:
        """
        Discover profitable wallets by analyzing top traders of a token.
        
        Args:
            mint: Token mint address
            min_pnl: Minimum PnL multiplier to qualify as whale
        
        Returns:
            List of wallet addresses that qualify
        """
        top_traders = await self.birdeye.get_top_traders(mint)
        discovered = []
        
        for trader in top_traders:
            address = trader.get("address", "")
            pnl = float(trader.get("pnl", 0))
            
            if pnl > min_pnl and address:
                profile = self.add_wallet(address, f"discovered_from_{mint[:8]}")
                profile.total_pnl_sol += pnl
                discovered.append(address)
        
        return discovered

    async def scan_wallet_activity(self, address: str) -> List[Dict]:
        """
        Scan a wallet's recent activity for trade signals.
        
        Returns list of new buy/sell actions detected.
        """
        if address not in self.wallets:
            return []
        
        profile = self.wallets[address]
        txs = await self.helius.get_parsed_transactions(address, limit=20)
        
        new_actions = []
        for tx in txs:
            tx_type = tx.get("type", "")
            
            # Detect swap transactions
            if tx_type in ("SWAP", "TOKEN_SWAP"):
                token_transfers = tx.get("tokenTransfers", [])
                
                # Determine if this is a buy or sell
                sol_out = False
                token_in = None
                sol_in = False
                token_out = None
                
                for transfer in token_transfers:
                    mint = transfer.get("mint", "")
                    from_addr = transfer.get("fromUserAccount", "")
                    to_addr = transfer.get("toUserAccount", "")
                    amount = float(transfer.get("tokenAmount", 0))
                    
                    if to_addr == address and mint != "So11111111111111111111111111111111111111112":
                        token_in = {"mint": mint, "amount": amount}
                    elif from_addr == address and mint != "So11111111111111111111111111111111111111112":
                        token_out = {"mint": mint, "amount": amount}
                    elif from_addr == address:
                        sol_out = True
                    elif to_addr == address:
                        sol_in = True
                
                action = None
                if sol_out and token_in:
                    # Whale bought a token with SOL
                    action = {
                        "type": "buy",
                        "wallet": address,
                        "token_mint": token_in["mint"],
                        "token_amount": token_in["amount"],
                        "timestamp": tx.get("timestamp"),
                        "signature": tx.get("signature"),
                        "trust_score": profile.trust_score,
                    }
                elif sol_in and token_out:
                    # Whale sold a token for SOL
                    action = {
                        "type": "sell",
                        "wallet": address,
                        "token_mint": token_out["mint"],
                        "token_amount": token_out["amount"],
                        "timestamp": tx.get("timestamp"),
                        "signature": tx.get("signature"),
                        "trust_score": profile.trust_score,
                    }
                
                if action:
                    new_actions.append(action)
                    
                    # Update profile
                    profile.last_active = datetime.now(timezone.utc).isoformat()
                    if action["type"] == "buy":
                        profile.recent_buys.append(action)
                        if len(profile.recent_buys) > 50:
                            profile.recent_buys.pop(0)
                    else:
                        profile.recent_sells.append(action)
                        if len(profile.recent_sells) > 50:
                            profile.recent_sells.pop(0)
        
        return new_actions

    async def generate_copy_signals(self) -> List[Dict]:
        """
        Scan all tracked wallets and generate copy-trade signals.
        
        Only generates signals from wallets with trust_score >= threshold.
        """
        signals = []
        
        for address, profile in self.wallets.items():
            if profile.trust_score < self.min_trust_score:
                continue
            
            actions = await self.scan_wallet_activity(address)
            
            for action in actions:
                signal = {
                    "source": "whale_tracker",
                    "whale_address": address,
                    "whale_label": profile.label,
                    "whale_trust_score": profile.trust_score,
                    "whale_win_rate": profile.win_rate,
                    "action": action["type"],
                    "token_mint": action["token_mint"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "confidence": profile.trust_score / 100.0,
                    "suggested_size_pct": self.max_position_per_signal * (profile.trust_score / 100.0),
                }
                signals.append(signal)
                self.signals_generated += 1
        
        self.signals = signals
        return signals

    def get_state(self) -> Dict:
        """Get whale tracker state for dashboard."""
        return {
            "active": self.active,
            "wallets_tracked": len(self.wallets),
            "signals_generated": self.signals_generated,
            "signals_profitable": self.signals_profitable,
            "top_wallets": sorted(
                [
                    {
                        "address": w.address[:8] + "..." + w.address[-4:],
                        "label": w.label,
                        "trust_score": w.trust_score,
                        "win_rate": w.win_rate,
                        "total_trades": w.total_trades,
                        "total_pnl_sol": w.total_pnl_sol,
                    }
                    for w in self.wallets.values()
                ],
                key=lambda x: x["trust_score"],
                reverse=True,
            )[:10],
            "recent_signals": self.signals[-10:],
        }

    async def close(self):
        await self.helius.close()
        await self.birdeye.close()
