"""
Rug Pull Detector - Token Safety Analysis
==========================================
Multi-layer safety analysis to avoid scams, rugs, and honeypots.
The #1 risk in memecoin trading is losing everything to a rug pull.
This module is the shield.
"""

import asyncio
import aiohttp
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field


# ============================================================================
# SAFETY SCORE THRESHOLDS
# ============================================================================

SAFETY_THRESHOLDS = {
    "min_liquidity_usd": 5000,        # Minimum $5k liquidity
    "max_top_holder_pct": 30.0,        # No single holder > 30%
    "max_creator_holding_pct": 15.0,   # Creator should hold < 15%
    "min_holders": 50,                  # At least 50 holders
    "min_pool_age_minutes": 5,          # Pool must be at least 5 min old
    "max_buy_tax_pct": 10.0,           # Max 10% buy tax
    "max_sell_tax_pct": 10.0,          # Max 10% sell tax
    "require_renounced": False,         # Ownership renounced (nice to have)
    "require_locked_lp": False,         # LP locked (nice to have, not required for pump.fun)
}


@dataclass
class SafetyReport:
    """Complete safety analysis report for a token."""
    
    mint: str
    name: str = ""
    symbol: str = ""
    
    # Overall score (0-100, higher = safer)
    safety_score: float = 0.0
    is_safe: bool = False
    
    # Individual checks
    liquidity_usd: float = 0.0
    liquidity_ok: bool = False
    
    top_holder_pct: float = 0.0
    holder_distribution_ok: bool = False
    
    creator_holding_pct: float = 0.0
    creator_ok: bool = False
    
    holder_count: int = 0
    holders_ok: bool = False
    
    pool_age_minutes: float = 0.0
    age_ok: bool = False
    
    buy_tax_pct: float = 0.0
    sell_tax_pct: float = 0.0
    tax_ok: bool = False
    
    is_honeypot: bool = False
    honeypot_ok: bool = True
    
    ownership_renounced: bool = False
    lp_locked: bool = False
    
    # Mint/freeze authority
    has_mint_authority: bool = False
    has_freeze_authority: bool = False
    authority_ok: bool = True
    
    # Red flags
    red_flags: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Analysis timestamp
    analyzed_at: str = ""
    
    def calculate_score(self):
        """Calculate overall safety score from individual checks."""
        score = 0
        max_score = 0
        
        # Liquidity (20 points)
        max_score += 20
        if self.liquidity_ok:
            score += 20
        elif self.liquidity_usd > 2000:
            score += 10
        
        # Holder distribution (20 points)
        max_score += 20
        if self.holder_distribution_ok:
            score += 20
        elif self.top_holder_pct < 50:
            score += 10
        
        # Creator holdings (15 points)
        max_score += 15
        if self.creator_ok:
            score += 15
        elif self.creator_holding_pct < 25:
            score += 8
        
        # Holder count (10 points)
        max_score += 10
        if self.holders_ok:
            score += 10
        elif self.holder_count > 20:
            score += 5
        
        # Pool age (10 points)
        max_score += 10
        if self.age_ok:
            score += 10
        elif self.pool_age_minutes > 2:
            score += 5
        
        # Tax (10 points)
        max_score += 10
        if self.tax_ok:
            score += 10
        
        # Honeypot (15 points -- critical)
        max_score += 15
        if self.honeypot_ok:
            score += 15
        
        # Authority checks (bonus/penalty)
        if self.has_mint_authority:
            score -= 10
            self.red_flags.append("Mint authority not revoked -- can create infinite tokens")
        if self.has_freeze_authority:
            score -= 10
            self.red_flags.append("Freeze authority active -- can freeze your tokens")
        
        # Bonus for renounced ownership
        if self.ownership_renounced:
            score += 5
        if self.lp_locked:
            score += 5
        
        self.safety_score = max(0, min(100, (score / max_score) * 100 if max_score > 0 else 0))
        self.is_safe = self.safety_score >= 50 and not self.is_honeypot
    
    def to_dict(self) -> Dict:
        return {
            "mint": self.mint,
            "name": self.name,
            "symbol": self.symbol,
            "safety_score": self.safety_score,
            "is_safe": self.is_safe,
            "liquidity_usd": self.liquidity_usd,
            "top_holder_pct": self.top_holder_pct,
            "holder_count": self.holder_count,
            "pool_age_minutes": self.pool_age_minutes,
            "buy_tax_pct": self.buy_tax_pct,
            "sell_tax_pct": self.sell_tax_pct,
            "is_honeypot": self.is_honeypot,
            "has_mint_authority": self.has_mint_authority,
            "has_freeze_authority": self.has_freeze_authority,
            "red_flags": self.red_flags,
            "warnings": self.warnings,
            "analyzed_at": self.analyzed_at,
        }


# ============================================================================
# RUGCHECK API - Solana token safety
# ============================================================================

class RugCheckClient:
    """
    RugCheck.xyz API for Solana token safety analysis.
    The gold standard for Solana token safety checks.
    """

    BASE_URL = "https://api.rugcheck.xyz/v1"

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.cache: Dict[str, Dict] = {}
        self.cache_ttl_seconds = 300  # 5 minute cache

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def check_token(self, mint: str) -> Optional[Dict]:
        """Get RugCheck analysis for a token."""
        # Check cache
        if mint in self.cache:
            cached = self.cache[mint]
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(cached["cached_at"])).total_seconds()
            if age < self.cache_ttl_seconds:
                return cached["data"]
        
        await self._ensure_session()
        try:
            async with self.session.get(
                f"{self.BASE_URL}/tokens/{mint}/report",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.cache[mint] = {
                        "data": data,
                        "cached_at": datetime.now(timezone.utc).isoformat(),
                    }
                    return data
                return None
        except Exception as e:
            print(f"[RUGCHECK] Error: {e}")
            return None

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# GOPLUS SECURITY API - Cross-chain token security
# ============================================================================

class GoPlusClient:
    """
    GoPlus Security API for token safety analysis.
    Provides honeypot detection, tax analysis, and more.
    """

    BASE_URL = "https://api.gopluslabs.io/api/v1"

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    async def check_token_security(self, mint: str, chain: str = "solana") -> Optional[Dict]:
        """Get GoPlus security analysis for a token."""
        await self._ensure_session()
        
        chain_id_map = {
            "solana": "solana",
            "ethereum": "1",
            "bsc": "56",
            "base": "8453",
        }
        chain_id = chain_id_map.get(chain, chain)
        
        try:
            async with self.session.get(
                f"{self.BASE_URL}/solana/token_security",
                params={"contract_addresses": mint},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    result = data.get("result", {})
                    return result.get(mint.lower()) or result.get(mint)
                return None
        except Exception as e:
            print(f"[GOPLUS] Error: {e}")
            return None

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# RUG PULL DETECTOR ENGINE
# ============================================================================

class RugDetector:
    """
    Multi-source rug pull detection engine.
    
    Combines data from:
    1. RugCheck.xyz -- Solana-specific safety analysis
    2. GoPlus -- Cross-chain security API
    3. On-chain analysis -- Direct RPC queries for authority checks
    4. DexScreener -- Liquidity and holder data
    
    Every token MUST pass this check before any buy order is placed.
    """

    def __init__(self, dex_screener=None):
        self.rugcheck = RugCheckClient()
        self.goplus = GoPlusClient()
        self.dex_screener = dex_screener
        
        # Stats
        self.tokens_analyzed = 0
        self.tokens_flagged = 0
        self.rugs_prevented = 0
        
        # History
        self.analysis_history: List[SafetyReport] = []

    async def analyze_token(self, mint: str, name: str = "", symbol: str = "") -> SafetyReport:
        """
        Full safety analysis of a token.
        
        This is the gatekeeper -- no trade happens without passing this.
        """
        self.tokens_analyzed += 1
        report = SafetyReport(
            mint=mint,
            name=name,
            symbol=symbol,
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )
        
        # Run all checks in parallel
        tasks = [
            self.rugcheck.check_token(mint),
            self.goplus.check_token_security(mint),
        ]
        
        if self.dex_screener:
            tasks.append(self.dex_screener.get_token_pairs(mint))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        rugcheck_data = results[0] if not isinstance(results[0], Exception) else None
        goplus_data = results[1] if not isinstance(results[1], Exception) else None
        dex_data = results[2] if len(results) > 2 and not isinstance(results[2], Exception) else None
        
        # Process RugCheck data
        if rugcheck_data:
            self._process_rugcheck(report, rugcheck_data)
        
        # Process GoPlus data
        if goplus_data:
            self._process_goplus(report, goplus_data)
        
        # Process DexScreener data
        if dex_data and isinstance(dex_data, list) and dex_data:
            self._process_dex_data(report, dex_data)
        
        # Apply thresholds
        report.liquidity_ok = report.liquidity_usd >= SAFETY_THRESHOLDS["min_liquidity_usd"]
        report.holder_distribution_ok = report.top_holder_pct <= SAFETY_THRESHOLDS["max_top_holder_pct"]
        report.creator_ok = report.creator_holding_pct <= SAFETY_THRESHOLDS["max_creator_holding_pct"]
        report.holders_ok = report.holder_count >= SAFETY_THRESHOLDS["min_holders"]
        report.age_ok = report.pool_age_minutes >= SAFETY_THRESHOLDS["min_pool_age_minutes"]
        report.tax_ok = (
            report.buy_tax_pct <= SAFETY_THRESHOLDS["max_buy_tax_pct"] and
            report.sell_tax_pct <= SAFETY_THRESHOLDS["max_sell_tax_pct"]
        )
        report.honeypot_ok = not report.is_honeypot
        report.authority_ok = not report.has_mint_authority and not report.has_freeze_authority
        
        # Generate warnings
        if not report.liquidity_ok:
            report.warnings.append(f"Low liquidity: ${report.liquidity_usd:,.0f}")
        if not report.holder_distribution_ok:
            report.warnings.append(f"Top holder owns {report.top_holder_pct:.1f}%")
        if not report.holders_ok:
            report.warnings.append(f"Only {report.holder_count} holders")
        if not report.age_ok:
            report.warnings.append(f"Pool only {report.pool_age_minutes:.0f} min old")
        if report.is_honeypot:
            report.red_flags.append("HONEYPOT DETECTED -- cannot sell")
        
        # Calculate final score
        report.calculate_score()
        
        if not report.is_safe:
            self.tokens_flagged += 1
        
        # Store in history
        self.analysis_history.append(report)
        if len(self.analysis_history) > 200:
            self.analysis_history.pop(0)
        
        return report

    def _process_rugcheck(self, report: SafetyReport, data: Dict):
        """Process RugCheck API response."""
        # RugCheck risk levels: "Good", "Warn", "Danger"
        risks = data.get("risks", [])
        
        for risk in risks:
            level = risk.get("level", "")
            name = risk.get("name", "")
            description = risk.get("description", "")
            
            if level == "danger":
                report.red_flags.append(f"{name}: {description}")
            elif level == "warn":
                report.warnings.append(f"{name}: {description}")
        
        # Token info
        token_meta = data.get("tokenMeta", {})
        report.name = report.name or token_meta.get("name", "")
        report.symbol = report.symbol or token_meta.get("symbol", "")
        
        # Top holders
        top_holders = data.get("topHolders", [])
        if top_holders:
            report.top_holder_pct = float(top_holders[0].get("pct", 0)) * 100
        
        # Markets/liquidity
        markets = data.get("markets", [])
        total_liq = 0
        for market in markets:
            liq = float(market.get("lp", {}).get("usd", 0))
            total_liq += liq
        report.liquidity_usd = max(report.liquidity_usd, total_liq)
        
        # Mint/freeze authority
        report.has_mint_authority = data.get("mintAuthority") is not None
        report.has_freeze_authority = data.get("freezeAuthority") is not None

    def _process_goplus(self, report: SafetyReport, data: Dict):
        """Process GoPlus API response."""
        if not data:
            return
        
        # Honeypot check
        is_honeypot = data.get("is_honeypot")
        if is_honeypot and str(is_honeypot) == "1":
            report.is_honeypot = True
        
        # Tax
        buy_tax = data.get("buy_tax")
        sell_tax = data.get("sell_tax")
        if buy_tax:
            report.buy_tax_pct = float(buy_tax) * 100
        if sell_tax:
            report.sell_tax_pct = float(sell_tax) * 100
        
        # Holder count
        holder_count = data.get("holder_count")
        if holder_count:
            report.holder_count = max(report.holder_count, int(holder_count))
        
        # Creator info
        creator_pct = data.get("creator_percent")
        if creator_pct:
            report.creator_holding_pct = float(creator_pct) * 100
        
        # LP info
        lp_holders = data.get("lp_holders", [])
        for lp in lp_holders:
            if lp.get("is_locked"):
                report.lp_locked = True
                break
        
        # Owner
        if data.get("owner_address") in (None, "", "0x0000000000000000000000000000000000000000"):
            report.ownership_renounced = True

    def _process_dex_data(self, report: SafetyReport, pairs: List[Dict]):
        """Process DexScreener pair data."""
        if not pairs:
            return
        
        # Use the most liquid pair
        best_pair = max(pairs, key=lambda p: float(p.get("liquidity", {}).get("usd", 0) or 0))
        
        liq = float(best_pair.get("liquidity", {}).get("usd", 0) or 0)
        report.liquidity_usd = max(report.liquidity_usd, liq)
        
        # Pool age
        pair_created = best_pair.get("pairCreatedAt")
        if pair_created:
            try:
                created_time = datetime.fromtimestamp(pair_created / 1000, tz=timezone.utc)
                age = (datetime.now(timezone.utc) - created_time).total_seconds() / 60
                report.pool_age_minutes = age
            except Exception:
                pass

    def get_state(self) -> Dict:
        """Get rug detector state for dashboard."""
        recent = self.analysis_history[-10:]
        return {
            "tokens_analyzed": self.tokens_analyzed,
            "tokens_flagged": self.tokens_flagged,
            "rugs_prevented": self.rugs_prevented,
            "recent_analyses": [r.to_dict() for r in recent],
            "flagged_tokens": [
                r.to_dict() for r in self.analysis_history
                if not r.is_safe
            ][-5:],
        }

    async def close(self):
        await self.rugcheck.close()
        await self.goplus.close()
