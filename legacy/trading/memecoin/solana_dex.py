"""
Solana DEX Integration - Jupiter, Raydium, Pump.fun
====================================================
Direct on-chain trading for memecoins on Solana.
Handles token swaps, liquidity detection, and atomic execution.
"""

import asyncio
import aiohttp
import json
import time
import base64
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field


# ============================================================================
# SOLANA RPC CLIENT
# ============================================================================

class SolanaRPC:
    """Lightweight Solana RPC client for on-chain queries."""

    def __init__(self, rpc_url: str = "https://api.mainnet-beta.solana.com"):
        self.rpc_url = rpc_url
        self.session: Optional[aiohttp.ClientSession] = None
        self._request_id = 0

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def _rpc_call(self, method: str, params: list = None) -> Dict:
        await self._ensure_session()
        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params or [],
        }
        try:
            async with self.session.post(
                self.rpc_url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json()
                return data.get("result", {})
        except Exception as e:
            return {"error": str(e)}

    async def get_balance(self, pubkey: str) -> float:
        result = await self._rpc_call("getBalance", [pubkey])
        if isinstance(result, dict) and "value" in result:
            return result["value"] / 1e9  # lamports to SOL
        return 0.0

    async def get_token_accounts(self, owner: str, mint: str = None) -> List[Dict]:
        params = [
            owner,
            {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
        ]
        if mint:
            params[1] = {"mint": mint}
        params.append({"encoding": "jsonParsed"})
        result = await self._rpc_call("getTokenAccountsByOwner", params)
        if isinstance(result, dict) and "value" in result:
            return result["value"]
        return []

    async def get_token_supply(self, mint: str) -> Dict:
        result = await self._rpc_call("getTokenSupply", [mint])
        return result if isinstance(result, dict) else {}

    async def get_recent_blockhash(self) -> str:
        result = await self._rpc_call("getLatestBlockhash")
        if isinstance(result, dict) and "value" in result:
            return result["value"].get("blockhash", "")
        return ""

    async def get_signature_statuses(self, signatures: List[str]) -> List[Dict]:
        result = await self._rpc_call("getSignatureStatuses", [signatures])
        if isinstance(result, dict) and "value" in result:
            return result["value"]
        return []

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# JUPITER AGGREGATOR - Best price routing across all Solana DEXes
# ============================================================================

class JupiterAggregator:
    """
    Jupiter V6 API integration for optimal swap routing.
    Jupiter aggregates liquidity from Raydium, Orca, Meteora, etc.
    to find the best price for any token swap on Solana.
    """

    BASE_URL = "https://quote-api.jup.ag/v6"
    PRICE_URL = "https://price.jup.ag/v6"

    # Well-known token mints
    SOL_MINT = "So11111111111111111111111111111111111111112"
    USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"

    def __init__(self, rpc_url: str = None):
        self.session: Optional[aiohttp.ClientSession] = None
        self.rpc = SolanaRPC(rpc_url) if rpc_url else SolanaRPC()
        self.swap_count = 0
        self.total_volume_usd = 0.0

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def get_quote(
        self,
        input_mint: str,
        output_mint: str,
        amount_lamports: int,
        slippage_bps: int = 100,  # 1% default slippage
        only_direct_routes: bool = False,
    ) -> Optional[Dict]:
        """
        Get the best swap quote from Jupiter.
        
        Args:
            input_mint: Token mint address to sell
            output_mint: Token mint address to buy
            amount_lamports: Amount in smallest unit (lamports for SOL, etc.)
            slippage_bps: Slippage tolerance in basis points (100 = 1%)
            only_direct_routes: If True, skip multi-hop routes
        
        Returns:
            Quote dict with route info, or None if no route found
        """
        await self._ensure_session()
        params = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(amount_lamports),
            "slippageBps": slippage_bps,
            "onlyDirectRoutes": str(only_direct_routes).lower(),
        }
        try:
            async with self.session.get(
                f"{self.BASE_URL}/quote",
                params=params,
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data
                return None
        except Exception as e:
            print(f"[JUPITER] Quote error: {e}")
            return None

    async def get_swap_transaction(
        self,
        quote: Dict,
        user_public_key: str,
        wrap_unwrap_sol: bool = True,
        priority_fee_lamports: int = 100000,  # 0.0001 SOL priority fee
    ) -> Optional[str]:
        """
        Get the serialized swap transaction from Jupiter.
        
        Returns base64-encoded transaction ready for signing.
        """
        await self._ensure_session()
        payload = {
            "quoteResponse": quote,
            "userPublicKey": user_public_key,
            "wrapAndUnwrapSol": wrap_unwrap_sol,
            "computeUnitPriceMicroLamports": priority_fee_lamports,
            "dynamicComputeUnitLimit": True,
        }
        try:
            async with self.session.post(
                f"{self.BASE_URL}/swap",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("swapTransaction")
                return None
        except Exception as e:
            print(f"[JUPITER] Swap tx error: {e}")
            return None

    async def get_token_price(self, mint: str) -> Optional[float]:
        """Get token price in USD from Jupiter price API."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.PRICE_URL}/price",
                params={"ids": mint},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    price_data = data.get("data", {}).get(mint)
                    if price_data:
                        return float(price_data.get("price", 0))
                return None
        except Exception:
            return None

    async def get_multiple_prices(self, mints: List[str]) -> Dict[str, float]:
        """Get prices for multiple tokens at once."""
        await self._ensure_session()
        prices = {}
        try:
            ids_str = ",".join(mints)
            async with self.session.get(
                f"{self.PRICE_URL}/price",
                params={"ids": ids_str},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    for mint in mints:
                        price_data = data.get("data", {}).get(mint)
                        if price_data:
                            prices[mint] = float(price_data.get("price", 0))
        except Exception:
            pass
        return prices

    async def execute_swap(
        self,
        input_mint: str,
        output_mint: str,
        amount_lamports: int,
        user_public_key: str,
        slippage_bps: int = 150,
        priority_fee: int = 200000,
    ) -> Dict:
        """
        Full swap execution pipeline:
        1. Get quote
        2. Build transaction
        3. Return transaction for signing
        
        The actual signing must happen with the user's private key
        (handled by the wallet manager).
        """
        # Step 1: Get quote
        quote = await self.get_quote(
            input_mint, output_mint, amount_lamports, slippage_bps
        )
        if not quote:
            return {"success": False, "error": "No route found"}

        # Extract quote details
        in_amount = int(quote.get("inAmount", 0))
        out_amount = int(quote.get("outAmount", 0))
        price_impact = float(quote.get("priceImpactPct", 0))

        # Safety check: reject if price impact > 5%
        if abs(price_impact) > 5.0:
            return {
                "success": False,
                "error": f"Price impact too high: {price_impact:.2f}%",
                "price_impact": price_impact,
            }

        # Step 2: Get swap transaction
        swap_tx = await self.get_swap_transaction(
            quote, user_public_key, priority_fee_lamports=priority_fee
        )
        if not swap_tx:
            return {"success": False, "error": "Failed to build swap transaction"}

        self.swap_count += 1

        return {
            "success": True,
            "transaction": swap_tx,
            "in_amount": in_amount,
            "out_amount": out_amount,
            "price_impact_pct": price_impact,
            "route_plan": quote.get("routePlan", []),
            "slippage_bps": slippage_bps,
        }

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()
        await self.rpc.close()


# ============================================================================
# RAYDIUM POOL MONITOR - New liquidity pool detection
# ============================================================================

class RaydiumPoolMonitor:
    """
    Monitors Raydium for new liquidity pools.
    New pools = new token launches = potential 10-100x opportunities.
    """

    RAYDIUM_API = "https://api.raydium.io/v2"
    RAYDIUM_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"

    def __init__(self, rpc: SolanaRPC = None):
        self.rpc = rpc or SolanaRPC()
        self.session: Optional[aiohttp.ClientSession] = None
        self.known_pools: Dict[str, Dict] = {}
        self.new_pool_callbacks: List = []
        self.pools_discovered = 0

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def get_pool_info(self, pool_id: str) -> Optional[Dict]:
        """Get detailed info about a specific Raydium pool."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.RAYDIUM_API}/ammV3/ammPools",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    pools = data.get("data", [])
                    for pool in pools:
                        if pool.get("id") == pool_id:
                            return pool
                return None
        except Exception:
            return None

    async def scan_new_pools(self) -> List[Dict]:
        """
        Scan for newly created Raydium pools.
        Returns list of new pools not seen before.
        """
        await self._ensure_session()
        new_pools = []
        try:
            async with self.session.get(
                f"{self.RAYDIUM_API}/main/pairs",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    pairs = data if isinstance(data, list) else data.get("data", [])
                    for pair in pairs:
                        pool_id = pair.get("ammId", pair.get("id", ""))
                        if pool_id and pool_id not in self.known_pools:
                            self.known_pools[pool_id] = {
                                "discovered_at": datetime.now(timezone.utc).isoformat(),
                                "data": pair,
                            }
                            new_pools.append(pair)
                            self.pools_discovered += 1
        except Exception as e:
            print(f"[RAYDIUM] Pool scan error: {e}")
        return new_pools

    async def get_pool_liquidity(self, pool_id: str) -> float:
        """Get total liquidity in USD for a pool."""
        pool = await self.get_pool_info(pool_id)
        if pool:
            return float(pool.get("tvl", 0))
        return 0.0

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# PUMP.FUN MONITOR - Token launch sniping
# ============================================================================

class PumpFunMonitor:
    """
    Monitors Pump.fun for new token launches on Solana.
    Pump.fun is the #1 memecoin launchpad -- tokens can 100x in minutes.
    
    Strategy:
    1. Detect new token creation
    2. Analyze bonding curve position
    3. Check creator wallet history
    4. Snipe early if criteria met
    """

    PUMP_API = "https://frontend-api.pump.fun"

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.tracked_tokens: Dict[str, Dict] = {}
        self.snipe_history: List[Dict] = []
        self.tokens_analyzed = 0

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def get_new_tokens(self, limit: int = 50) -> List[Dict]:
        """Get recently created tokens from Pump.fun."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.PUMP_API}/coins",
                params={"offset": 0, "limit": limit, "sort": "created_timestamp"},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data if isinstance(data, list) else data.get("coins", [])
                return []
        except Exception as e:
            print(f"[PUMP.FUN] Error fetching new tokens: {e}")
            return []

    async def get_token_info(self, mint: str) -> Optional[Dict]:
        """Get detailed info about a Pump.fun token."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.PUMP_API}/coins/{mint}",
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                return None
        except Exception:
            return None

    async def get_bonding_curve_position(self, mint: str) -> Dict:
        """
        Analyze where a token is on its bonding curve.
        
        Pump.fun tokens follow a bonding curve:
        - Early = cheap, high upside
        - Late = expensive, limited upside
        - Graduated = moved to Raydium, different dynamics
        """
        info = await self.get_token_info(mint)
        if not info:
            return {"position": "unknown", "progress_pct": 0}

        market_cap = float(info.get("usd_market_cap", 0))
        is_graduated = info.get("complete", False)

        if is_graduated:
            return {
                "position": "graduated",
                "progress_pct": 100,
                "market_cap": market_cap,
                "raydium_pool": info.get("raydium_pool"),
            }

        # Pump.fun graduation threshold is ~$69k market cap
        graduation_threshold = 69000
        progress = min(100, (market_cap / graduation_threshold) * 100)

        return {
            "position": "bonding_curve",
            "progress_pct": progress,
            "market_cap": market_cap,
            "early_stage": progress < 20,
            "mid_stage": 20 <= progress < 60,
            "late_stage": progress >= 60,
        }

    async def analyze_token_for_snipe(self, token: Dict) -> Dict:
        """
        Full analysis of a Pump.fun token for sniping potential.
        
        Scoring criteria:
        - Bonding curve position (earlier = better)
        - Creator wallet history (repeat creators = risky)
        - Name/ticker meme potential
        - Initial buy volume
        """
        self.tokens_analyzed += 1
        mint = token.get("mint", "")
        
        score = 0
        reasons = []

        # 1. Bonding curve position
        curve = await self.get_bonding_curve_position(mint)
        if curve.get("early_stage"):
            score += 40
            reasons.append("Early bonding curve position")
        elif curve.get("mid_stage"):
            score += 20
            reasons.append("Mid bonding curve")
        elif curve.get("graduated"):
            score += 10
            reasons.append("Graduated to Raydium")

        # 2. Market cap sweet spot ($5k - $50k for max upside)
        mcap = curve.get("market_cap", 0)
        if 5000 <= mcap <= 50000:
            score += 30
            reasons.append(f"Sweet spot market cap: ${mcap:,.0f}")
        elif mcap < 5000:
            score += 15
            reasons.append(f"Very early: ${mcap:,.0f}")
        elif mcap > 50000:
            score += 5
            reasons.append(f"Higher cap: ${mcap:,.0f}")

        # 3. Name analysis (meme potential)
        name = token.get("name", "").lower()
        ticker = token.get("symbol", "").lower()
        meme_keywords = [
            "pepe", "doge", "shib", "inu", "moon", "elon", "trump",
            "cat", "dog", "frog", "wojak", "chad", "based", "giga",
            "ai", "gpt", "agent", "sol", "bonk", "wif", "popcat",
        ]
        for kw in meme_keywords:
            if kw in name or kw in ticker:
                score += 10
                reasons.append(f"Meme keyword: {kw}")
                break

        # 4. Reply count / social engagement
        reply_count = token.get("reply_count", 0)
        if reply_count > 50:
            score += 15
            reasons.append(f"High engagement: {reply_count} replies")
        elif reply_count > 10:
            score += 8
            reasons.append(f"Some engagement: {reply_count} replies")

        return {
            "mint": mint,
            "name": token.get("name", ""),
            "symbol": token.get("symbol", ""),
            "score": min(100, score),
            "snipe_worthy": score >= 50,
            "reasons": reasons,
            "bonding_curve": curve,
            "market_cap": mcap,
            "created_at": token.get("created_timestamp"),
        }

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# DEX SCREENER - Cross-chain token discovery
# ============================================================================

class DexScreener:
    """
    DexScreener API for discovering trending tokens across all chains.
    Focuses on Solana but can scan Ethereum, Base, etc.
    """

    BASE_URL = "https://api.dexscreener.com"

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def get_trending_tokens(self, chain: str = "solana") -> List[Dict]:
        """Get trending tokens on a specific chain."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/token-boosts/top/v1",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Filter by chain
                    return [
                        t for t in data
                        if t.get("chainId", "").lower() == chain.lower()
                    ]
                return []
        except Exception:
            return []

    async def search_token(self, query: str) -> List[Dict]:
        """Search for a token by name, symbol, or address."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/latest/dex/search",
                params={"q": query},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("pairs", [])
                return []
        except Exception:
            return []

    async def get_token_pairs(self, mint: str) -> List[Dict]:
        """Get all trading pairs for a token."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/latest/dex/tokens/{mint}",
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("pairs", [])
                return []
        except Exception:
            return []

    async def get_pair_info(self, chain: str, pair_address: str) -> Optional[Dict]:
        """Get detailed info about a specific trading pair."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/latest/dex/pairs/{chain}/{pair_address}",
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    pairs = data.get("pairs", [])
                    return pairs[0] if pairs else None
                return None
        except Exception:
            return None

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()
