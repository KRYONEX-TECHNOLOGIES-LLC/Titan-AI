"""
Memecoin Engine API Routes
===========================
FastAPI routes for the memecoin domination engine.
Integrates with the main TradeMaster Supreme API.
"""

import os
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from tms.memecoin.memecoin_engine import MemecoinEngine
from tms.memecoin.wallet_manager import SolanaWalletManager


# ============================================================================
# ROUTER SETUP
# ============================================================================

router = APIRouter(prefix="/api/memecoin", tags=["memecoin"])

# Engine instance (initialized on startup)
engine: Optional[MemecoinEngine] = None
wallet_manager: Optional[SolanaWalletManager] = None
engine_task: Optional[asyncio.Task] = None


def get_engine() -> MemecoinEngine:
    """Get or create the memecoin engine instance."""
    global engine, wallet_manager
    
    if engine is None:
        wallet_manager = SolanaWalletManager()
        engine = MemecoinEngine(
            solana_rpc_url=os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
            solana_wallet_pubkey=os.getenv("SOLANA_WALLET_PUBKEY", ""),
            helius_api_key=os.getenv("HELIUS_API_KEY", ""),
            birdeye_api_key=os.getenv("BIRDEYE_API_KEY", ""),
            twitter_bearer=os.getenv("TWITTER_BEARER_TOKEN", ""),
            telegram_token=os.getenv("TMS_TELEGRAM_BOT_TOKEN", ""),
        )
    return engine


# ============================================================================
# REQUEST MODELS
# ============================================================================

class BuyRequest(BaseModel):
    mint: str
    name: str = ""
    symbol: str = ""
    amount_sol: float
    reason: str = "Manual buy"

class SellRequest(BaseModel):
    mint: str
    sell_pct: float = 1.0  # 1.0 = sell all
    reason: str = "Manual sell"

class WatchlistRequest(BaseModel):
    mint: str
    name: str = ""
    symbol: str = ""

class EngineConfigRequest(BaseModel):
    auto_trade: Optional[bool] = None
    scan_interval_seconds: Optional[int] = None
    min_alpha_score: Optional[int] = None
    max_positions: Optional[int] = None

class WhaleWalletRequest(BaseModel):
    address: str
    label: str = ""


# ============================================================================
# ENGINE CONTROL
# ============================================================================

@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Get memecoin engine status and performance."""
    eng = get_engine()
    state = eng.get_state()
    
    # Add wallet info
    if wallet_manager:
        state["wallet"] = wallet_manager.get_state()
    
    return state


@router.post("/start")
async def start_engine() -> Dict[str, Any]:
    """Start the memecoin engine."""
    global engine_task
    eng = get_engine()
    
    if eng.active and engine_task and not engine_task.done():
        return {"status": "already_running", "message": "Engine is already running"}
    
    engine_task = asyncio.create_task(eng.run_engine_loop())
    
    return {
        "status": "started",
        "message": "Memecoin engine started",
        "wallet": wallet_manager.get_state() if wallet_manager else {},
    }


@router.post("/stop")
async def stop_engine() -> Dict[str, Any]:
    """Stop the memecoin engine."""
    eng = get_engine()
    await eng.shutdown()
    
    return {
        "status": "stopped",
        "total_trades": eng.total_trades,
        "total_pnl_sol": eng.total_pnl_sol,
    }


@router.post("/config")
async def update_config(config: EngineConfigRequest) -> Dict[str, Any]:
    """Update engine configuration."""
    eng = get_engine()
    
    if config.auto_trade is not None:
        eng.auto_trade = config.auto_trade
    if config.scan_interval_seconds is not None:
        eng.scan_interval_seconds = max(1, config.scan_interval_seconds)
    if config.min_alpha_score is not None:
        eng.min_alpha_score = max(0, min(100, config.min_alpha_score))
    if config.max_positions is not None:
        eng.position_sizer.max_positions = max(1, config.max_positions)
    
    return {
        "status": "updated",
        "auto_trade": eng.auto_trade,
        "scan_interval_seconds": eng.scan_interval_seconds,
        "min_alpha_score": eng.min_alpha_score,
        "max_positions": eng.position_sizer.max_positions,
    }


# ============================================================================
# TRADING
# ============================================================================

@router.post("/buy")
async def buy_token(request: BuyRequest) -> Dict[str, Any]:
    """Buy a memecoin token."""
    eng = get_engine()
    
    if not wallet_manager or not wallet_manager.is_configured:
        raise HTTPException(status_code=400, detail="Solana wallet not configured")
    
    # Safety check first
    safety = await eng.rug_detector.analyze_token(request.mint, request.name, request.symbol)
    if not safety.is_safe:
        raise HTTPException(
            status_code=400,
            detail=f"Token failed safety check (score: {safety.safety_score:.0f}). "
                   f"Red flags: {', '.join(safety.red_flags)}"
        )
    
    result = await eng.execute_buy(
        mint=request.mint,
        name=request.name,
        symbol=request.symbol,
        amount_sol=request.amount_sol,
        reason=request.reason,
        safety_score=safety.safety_score,
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Buy failed"))
    
    return result


@router.post("/sell")
async def sell_token(request: SellRequest) -> Dict[str, Any]:
    """Sell a memecoin position."""
    eng = get_engine()
    
    result = await eng.execute_sell(
        mint=request.mint,
        sell_pct=request.sell_pct,
        reason=request.reason,
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Sell failed"))
    
    return result


@router.post("/sell-all")
async def sell_all_positions() -> Dict[str, Any]:
    """Emergency sell all positions."""
    eng = get_engine()
    results = []
    
    for mint in list(eng.positions.keys()):
        result = await eng.execute_sell(mint, 1.0, "Emergency sell all")
        results.append(result)
    
    return {
        "status": "completed",
        "positions_closed": len(results),
        "results": results,
    }


# ============================================================================
# DISCOVERY & ANALYSIS
# ============================================================================

@router.get("/opportunities")
async def get_opportunities() -> List[Dict]:
    """Get current trading opportunities."""
    eng = get_engine()
    return eng.opportunities[:20]


@router.post("/scan")
async def trigger_scan() -> Dict[str, Any]:
    """Manually trigger a discovery scan."""
    eng = get_engine()
    opportunities = await eng.run_discovery_cycle()
    
    return {
        "status": "completed",
        "opportunities_found": len(opportunities),
        "opportunities": opportunities[:10],
    }


@router.get("/analyze/{mint}")
async def analyze_token(mint: str) -> Dict[str, Any]:
    """Full analysis of a specific token."""
    eng = get_engine()
    
    # Safety check
    safety = await eng.rug_detector.analyze_token(mint)
    
    # Get price
    price = await eng.jupiter.get_token_price(mint)
    
    # Get DexScreener data
    pairs = await eng.dex_screener.get_token_pairs(mint)
    
    # Get OHLCV if Birdeye is configured
    ohlcv = []
    if eng.whale_tracker.birdeye.api_key:
        ohlcv = await eng.whale_tracker.birdeye.get_ohlcv(mint, "15m", 50)
    
    # Alpha score
    token_data = {
        "liquidity_usd": safety.liquidity_usd,
        "volume_24h": 0,
        "volume_change_pct": 0,
    }
    
    alpha = eng.alpha_scorer.score_opportunity(
        token_data=token_data,
        safety_report=safety,
        price_data=ohlcv,
    )
    
    return {
        "mint": mint,
        "price_usd": price,
        "safety": safety.to_dict(),
        "alpha_score": alpha,
        "pairs": pairs[:5] if pairs else [],
        "ohlcv_count": len(ohlcv),
    }


# ============================================================================
# POSITIONS
# ============================================================================

@router.get("/positions")
async def get_positions() -> Dict[str, Any]:
    """Get all active positions."""
    eng = get_engine()
    
    return {
        "active": [p.to_dict() for p in eng.positions.values()],
        "closed_count": len(eng.closed_positions),
        "recent_closed": [p.to_dict() for p in eng.closed_positions[-10:]],
    }


@router.get("/positions/{mint}")
async def get_position(mint: str) -> Dict[str, Any]:
    """Get details of a specific position."""
    eng = get_engine()
    
    if mint in eng.positions:
        return eng.positions[mint].to_dict()
    
    # Check closed positions
    for p in eng.closed_positions:
        if p.token_mint == mint:
            return p.to_dict()
    
    raise HTTPException(status_code=404, detail="Position not found")


# ============================================================================
# WATCHLIST
# ============================================================================

@router.get("/watchlist")
async def get_watchlist() -> List[Dict]:
    """Get the token watchlist."""
    eng = get_engine()
    return list(eng.watchlist.values())


@router.post("/watchlist")
async def add_to_watchlist(request: WatchlistRequest) -> Dict[str, Any]:
    """Add a token to the watchlist."""
    eng = get_engine()
    
    # Analyze the token
    safety = await eng.rug_detector.analyze_token(request.mint, request.name, request.symbol)
    price = await eng.jupiter.get_token_price(request.mint)
    
    eng.watchlist[request.mint] = {
        "mint": request.mint,
        "name": request.name or safety.name,
        "symbol": request.symbol or safety.symbol,
        "price_usd": price,
        "safety_score": safety.safety_score,
        "is_safe": safety.is_safe,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    
    return eng.watchlist[request.mint]


@router.delete("/watchlist/{mint}")
async def remove_from_watchlist(mint: str) -> Dict[str, Any]:
    """Remove a token from the watchlist."""
    eng = get_engine()
    
    if mint in eng.watchlist:
        del eng.watchlist[mint]
        return {"status": "removed"}
    
    raise HTTPException(status_code=404, detail="Token not in watchlist")


# ============================================================================
# WHALE TRACKING
# ============================================================================

@router.get("/whales")
async def get_whale_tracker() -> Dict[str, Any]:
    """Get whale tracker status."""
    eng = get_engine()
    return eng.whale_tracker.get_state()


@router.post("/whales/add")
async def add_whale_wallet(request: WhaleWalletRequest) -> Dict[str, Any]:
    """Add a wallet to track."""
    eng = get_engine()
    profile = eng.whale_tracker.add_wallet(request.address, request.label)
    
    return {
        "status": "added",
        "address": profile.address,
        "label": profile.label,
        "total_tracked": len(eng.whale_tracker.wallets),
    }


@router.post("/whales/discover/{mint}")
async def discover_whales(mint: str) -> Dict[str, Any]:
    """Discover profitable wallets from a token's top traders."""
    eng = get_engine()
    discovered = await eng.whale_tracker.discover_whales_from_token(mint)
    
    return {
        "status": "completed",
        "wallets_discovered": len(discovered),
        "addresses": [a[:8] + "..." + a[-4:] for a in discovered],
    }


# ============================================================================
# SOCIAL SIGNALS
# ============================================================================

@router.get("/social")
async def get_social_signals() -> Dict[str, Any]:
    """Get social sentiment scanner status."""
    eng = get_engine()
    return eng.social_scanner.get_state()


@router.post("/social/scan")
async def trigger_social_scan() -> Dict[str, Any]:
    """Manually trigger a social media scan."""
    eng = get_engine()
    scores = await eng.social_scanner.full_scan()
    
    return {
        "status": "completed",
        "tokens_found": len(scores),
        "top_signals": eng.social_scanner.get_top_signals(10),
    }


# ============================================================================
# SAFETY
# ============================================================================

@router.get("/safety/{mint}")
async def check_token_safety(mint: str) -> Dict[str, Any]:
    """Run safety analysis on a token."""
    eng = get_engine()
    report = await eng.rug_detector.analyze_token(mint)
    return report.to_dict()


@router.get("/safety/history")
async def get_safety_history() -> Dict[str, Any]:
    """Get recent safety analysis history."""
    eng = get_engine()
    return eng.rug_detector.get_state()


# ============================================================================
# PERFORMANCE
# ============================================================================

@router.get("/performance")
async def get_performance() -> Dict[str, Any]:
    """Get detailed performance metrics."""
    eng = get_engine()
    
    win_rate = eng.winning_trades / max(1, eng.total_trades)
    
    # Calculate per-trade stats
    closed_pnls = [p.realized_pnl_pct for p in eng.closed_positions]
    avg_win = 0
    avg_loss = 0
    if closed_pnls:
        wins = [p for p in closed_pnls if p > 0]
        losses = [p for p in closed_pnls if p <= 0]
        avg_win = sum(wins) / len(wins) if wins else 0
        avg_loss = sum(losses) / len(losses) if losses else 0
    
    return {
        "total_trades": eng.total_trades,
        "winning_trades": eng.winning_trades,
        "losing_trades": eng.total_trades - eng.winning_trades,
        "win_rate": win_rate,
        "total_pnl_sol": eng.total_pnl_sol,
        "daily_pnl_sol": eng.daily_pnl_sol,
        "best_trade_pnl_pct": eng.best_trade_pnl_pct,
        "worst_trade_pnl_pct": eng.worst_trade_pnl_pct,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "profit_factor": abs(avg_win / avg_loss) if avg_loss != 0 else 0,
        "portfolio_value_sol": eng.portfolio_value_sol,
        "starting_value_sol": eng.starting_value_sol,
        "total_return_pct": (
            (eng.portfolio_value_sol - eng.starting_value_sol) / eng.starting_value_sol * 100
            if eng.starting_value_sol > 0 else 0
        ),
    }


# ============================================================================
# WALLET
# ============================================================================

@router.get("/wallet")
async def get_wallet_status() -> Dict[str, Any]:
    """Get Solana wallet status."""
    if wallet_manager:
        return wallet_manager.get_state()
    return {"configured": False, "error": "Wallet manager not initialized"}
