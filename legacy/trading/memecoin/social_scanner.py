"""
Social Sentiment Scanner - Twitter/X, Telegram, Reddit
=======================================================
Scans social media for memecoin alpha signals.
Social sentiment is the #1 driver of memecoin price action.
"""

import asyncio
import aiohttp
import re
import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import Counter


# ============================================================================
# SOCIAL SIGNAL TYPES
# ============================================================================

@dataclass
class SocialSignal:
    """A social media signal that could indicate memecoin alpha."""
    
    source: str  # "twitter", "telegram", "reddit"
    signal_type: str  # "mention_spike", "influencer_call", "trending", "new_token"
    token_name: str
    token_symbol: str
    token_mint: str = ""  # Solana mint address if known
    
    # Signal strength (0-100)
    strength: float = 0.0
    
    # Context
    mention_count: int = 0
    sentiment_score: float = 0.0  # -1 to 1
    influencer_followers: int = 0
    
    # Timing
    detected_at: str = ""
    first_mention: str = ""
    
    # Raw data
    sample_posts: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "source": self.source,
            "signal_type": self.signal_type,
            "token_name": self.token_name,
            "token_symbol": self.token_symbol,
            "token_mint": self.token_mint,
            "strength": self.strength,
            "mention_count": self.mention_count,
            "sentiment_score": self.sentiment_score,
            "influencer_followers": self.influencer_followers,
            "detected_at": self.detected_at,
        }


# ============================================================================
# TWITTER/X SCANNER
# ============================================================================

class TwitterScanner:
    """
    Scans Twitter/X for memecoin signals.
    
    Detection methods:
    1. Mention velocity -- sudden spike in token mentions
    2. Influencer calls -- known CT influencers mentioning a token
    3. Cashtag tracking -- $TICKER trending
    4. Sentiment analysis -- bullish vs bearish ratio
    """

    # Known Crypto Twitter influencers (by follower count tiers)
    # These are public figures whose calls move markets
    CT_INFLUENCERS = {
        "tier1": [],  # 500k+ followers -- populate with actual handles
        "tier2": [],  # 100k-500k followers
        "tier3": [],  # 50k-100k followers
    }

    def __init__(self, bearer_token: str = ""):
        self.bearer_token = bearer_token
        self.session: Optional[aiohttp.ClientSession] = None
        self.mention_history: Dict[str, List[Dict]] = {}  # token -> mentions over time
        self.signals: List[SocialSignal] = []
        self.scan_count = 0

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            headers = {}
            if self.bearer_token:
                headers["Authorization"] = f"Bearer {self.bearer_token}"
            self.session = aiohttp.ClientSession(headers=headers)

    async def search_tweets(self, query: str, max_results: int = 100) -> List[Dict]:
        """Search recent tweets using Twitter API v2."""
        if not self.bearer_token:
            return []
        await self._ensure_session()
        try:
            async with self.session.get(
                "https://api.twitter.com/2/tweets/search/recent",
                params={
                    "query": query,
                    "max_results": min(max_results, 100),
                    "tweet.fields": "created_at,public_metrics,author_id",
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("data", [])
                return []
        except Exception as e:
            print(f"[TWITTER] Search error: {e}")
            return []

    async def detect_mention_spike(
        self, token_symbol: str, window_minutes: int = 30
    ) -> Optional[SocialSignal]:
        """
        Detect sudden spike in mentions of a token.
        A spike = 3x+ increase in mention rate vs baseline.
        """
        query = f"${token_symbol} OR #{token_symbol}"
        tweets = await self.search_tweets(query)
        
        if not tweets:
            return None
        
        # Count mentions in current window
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)
        
        recent_count = 0
        sentiments = []
        
        for tweet in tweets:
            text = tweet.get("text", "").lower()
            metrics = tweet.get("public_metrics", {})
            
            recent_count += 1
            
            # Simple sentiment: bullish keywords vs bearish
            bullish_words = ["moon", "pump", "buy", "bullish", "gem", "100x", "lfg", "send it", "alpha"]
            bearish_words = ["dump", "sell", "rug", "scam", "bearish", "dead", "rip"]
            
            bull_count = sum(1 for w in bullish_words if w in text)
            bear_count = sum(1 for w in bearish_words if w in text)
            
            if bull_count + bear_count > 0:
                sentiment = (bull_count - bear_count) / (bull_count + bear_count)
            else:
                sentiment = 0.0
            sentiments.append(sentiment)
        
        # Check against baseline
        baseline_key = token_symbol.upper()
        if baseline_key not in self.mention_history:
            self.mention_history[baseline_key] = []
        
        # Store current count
        self.mention_history[baseline_key].append({
            "time": now.isoformat(),
            "count": recent_count,
        })
        
        # Keep only last 24 hours
        cutoff = now - timedelta(hours=24)
        self.mention_history[baseline_key] = [
            m for m in self.mention_history[baseline_key]
            if datetime.fromisoformat(m["time"]) > cutoff
        ]
        
        # Calculate baseline (average of previous windows)
        history = self.mention_history[baseline_key]
        if len(history) < 3:
            # Not enough history to detect spike
            return None
        
        baseline_avg = sum(m["count"] for m in history[:-1]) / max(1, len(history) - 1)
        
        # Spike detection: current > 3x baseline
        if baseline_avg > 0 and recent_count > baseline_avg * 3:
            avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0
            
            signal = SocialSignal(
                source="twitter",
                signal_type="mention_spike",
                token_name=token_symbol,
                token_symbol=token_symbol,
                strength=min(100, (recent_count / baseline_avg) * 20),
                mention_count=recent_count,
                sentiment_score=avg_sentiment,
                detected_at=now.isoformat(),
                sample_posts=[t.get("text", "")[:200] for t in tweets[:5]],
            )
            self.signals.append(signal)
            return signal
        
        return None

    async def scan_influencer_calls(self, token_symbol: str) -> Optional[SocialSignal]:
        """
        Check if any known CT influencers have mentioned a token.
        An influencer call can 2-10x a memecoin in minutes.
        """
        if not self.bearer_token:
            return None
        
        # Search for influencer mentions
        all_influencers = (
            self.CT_INFLUENCERS.get("tier1", []) +
            self.CT_INFLUENCERS.get("tier2", []) +
            self.CT_INFLUENCERS.get("tier3", [])
        )
        
        if not all_influencers:
            return None
        
        for handle in all_influencers[:10]:  # Check top 10
            query = f"from:{handle} ${token_symbol}"
            tweets = await self.search_tweets(query, max_results=10)
            
            if tweets:
                # Influencer mentioned this token
                signal = SocialSignal(
                    source="twitter",
                    signal_type="influencer_call",
                    token_name=token_symbol,
                    token_symbol=token_symbol,
                    strength=80,  # High strength for influencer calls
                    mention_count=len(tweets),
                    detected_at=datetime.now(timezone.utc).isoformat(),
                    sample_posts=[t.get("text", "")[:200] for t in tweets[:3]],
                )
                self.signals.append(signal)
                return signal
        
        return None

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# TELEGRAM SCANNER
# ============================================================================

class TelegramScanner:
    """
    Monitors Telegram channels for memecoin alpha.
    
    Many memecoin calls originate in Telegram groups before
    hitting Twitter. Being early here = being early on-chain.
    """

    def __init__(self, bot_token: str = ""):
        self.bot_token = bot_token
        self.session: Optional[aiohttp.ClientSession] = None
        self.monitored_channels: List[str] = []
        self.signals: List[SocialSignal] = []
        self.message_buffer: List[Dict] = []

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()

    def add_channel(self, channel_id: str):
        """Add a Telegram channel to monitor."""
        if channel_id not in self.monitored_channels:
            self.monitored_channels.append(channel_id)

    async def get_channel_messages(self, channel_id: str, limit: int = 50) -> List[Dict]:
        """Get recent messages from a Telegram channel."""
        if not self.bot_token:
            return []
        await self._ensure_session()
        try:
            async with self.session.get(
                f"https://api.telegram.org/bot{self.bot_token}/getUpdates",
                params={"limit": limit, "allowed_updates": ["channel_post"]},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    updates = data.get("result", [])
                    messages = []
                    for update in updates:
                        msg = update.get("channel_post", {})
                        if msg:
                            messages.append({
                                "text": msg.get("text", ""),
                                "date": msg.get("date"),
                                "chat_id": msg.get("chat", {}).get("id"),
                                "chat_title": msg.get("chat", {}).get("title"),
                            })
                    return messages
                return []
        except Exception:
            return []

    def extract_token_mentions(self, text: str) -> List[Dict]:
        """
        Extract potential token mentions from message text.
        
        Looks for:
        - $TICKER patterns
        - Solana mint addresses (base58, 32-44 chars)
        - "CA:" or "Contract:" followed by address
        - Common call patterns ("just aped", "new gem", etc.)
        """
        mentions = []
        
        # $TICKER pattern
        tickers = re.findall(r'\$([A-Z]{2,10})', text.upper())
        for ticker in tickers:
            if ticker not in ("USD", "SOL", "ETH", "BTC", "USDC", "USDT"):
                mentions.append({"type": "ticker", "value": ticker})
        
        # Solana address pattern (base58, 32-44 chars)
        addresses = re.findall(r'[1-9A-HJ-NP-Za-km-z]{32,44}', text)
        for addr in addresses:
            if len(addr) >= 32 and not addr.startswith("http"):
                mentions.append({"type": "address", "value": addr})
        
        # "CA:" pattern
        ca_matches = re.findall(r'(?:CA|Contract|Address)[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})', text)
        for ca in ca_matches:
            mentions.append({"type": "contract_address", "value": ca})
        
        return mentions

    async def scan_for_signals(self) -> List[SocialSignal]:
        """Scan all monitored channels for token signals."""
        signals = []
        
        for channel_id in self.monitored_channels:
            messages = await self.get_channel_messages(channel_id)
            
            for msg in messages:
                text = msg.get("text", "")
                if not text:
                    continue
                
                mentions = self.extract_token_mentions(text)
                
                # Check for call patterns
                call_patterns = [
                    "just aped", "new gem", "early call", "alpha call",
                    "100x potential", "moon mission", "lfg", "send it",
                    "buying this", "loaded up", "accumulating",
                ]
                
                is_call = any(p in text.lower() for p in call_patterns)
                
                if mentions and is_call:
                    for mention in mentions:
                        signal = SocialSignal(
                            source="telegram",
                            signal_type="channel_call",
                            token_name=mention["value"],
                            token_symbol=mention["value"][:10],
                            token_mint=mention["value"] if mention["type"] in ("address", "contract_address") else "",
                            strength=60,
                            mention_count=1,
                            detected_at=datetime.now(timezone.utc).isoformat(),
                            sample_posts=[text[:300]],
                        )
                        signals.append(signal)
        
        self.signals.extend(signals)
        return signals

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# REDDIT SCANNER
# ============================================================================

class RedditScanner:
    """
    Monitors Reddit for memecoin signals.
    Subreddits like r/CryptoMoonShots, r/SatoshiStreetBets, etc.
    """

    MEMECOIN_SUBREDDITS = [
        "CryptoMoonShots",
        "SatoshiStreetBets",
        "memecoin",
        "solana",
        "defi",
        "CryptoCurrency",
    ]

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.signals: List[SocialSignal] = []

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={"User-Agent": "TradeMasterSupreme/2.0"}
            )

    async def get_subreddit_posts(
        self, subreddit: str, sort: str = "new", limit: int = 25
    ) -> List[Dict]:
        """Get recent posts from a subreddit."""
        await self._ensure_session()
        try:
            async with self.session.get(
                f"https://www.reddit.com/r/{subreddit}/{sort}.json",
                params={"limit": limit},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    posts = data.get("data", {}).get("children", [])
                    return [p.get("data", {}) for p in posts]
                return []
        except Exception:
            return []

    async def scan_for_signals(self) -> List[SocialSignal]:
        """Scan memecoin subreddits for signals."""
        signals = []
        token_mentions: Dict[str, int] = Counter()
        
        for subreddit in self.MEMECOIN_SUBREDDITS:
            posts = await self.get_subreddit_posts(subreddit)
            
            for post in posts:
                title = post.get("title", "")
                selftext = post.get("selftext", "")
                score = post.get("score", 0)
                num_comments = post.get("num_comments", 0)
                
                full_text = f"{title} {selftext}"
                
                # Extract tickers
                tickers = re.findall(r'\$([A-Z]{2,10})', full_text.upper())
                for ticker in tickers:
                    if ticker not in ("USD", "SOL", "ETH", "BTC", "USDC", "USDT"):
                        token_mentions[ticker] += 1
                
                # High-engagement posts about specific tokens
                if score > 50 or num_comments > 20:
                    for ticker in set(tickers):
                        if ticker not in ("USD", "SOL", "ETH", "BTC", "USDC", "USDT"):
                            signal = SocialSignal(
                                source="reddit",
                                signal_type="high_engagement",
                                token_name=ticker,
                                token_symbol=ticker,
                                strength=min(80, score / 5 + num_comments),
                                mention_count=token_mentions.get(ticker, 1),
                                detected_at=datetime.now(timezone.utc).isoformat(),
                                sample_posts=[title[:200]],
                            )
                            signals.append(signal)
        
        self.signals.extend(signals)
        return signals

    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()


# ============================================================================
# UNIFIED SOCIAL SCANNER
# ============================================================================

class SocialSentimentEngine:
    """
    Unified social sentiment engine that combines all sources.
    
    Aggregates signals from Twitter, Telegram, and Reddit
    to produce a single confidence score for each token.
    """

    def __init__(
        self,
        twitter_bearer: str = "",
        telegram_token: str = "",
    ):
        self.twitter = TwitterScanner(twitter_bearer)
        self.telegram = TelegramScanner(telegram_token)
        self.reddit = RedditScanner()
        
        # Aggregated signals
        self.token_scores: Dict[str, Dict] = {}  # token -> aggregated score
        self.all_signals: List[SocialSignal] = []
        self.scan_count = 0
        self.active = False

    async def full_scan(self) -> Dict[str, Dict]:
        """
        Run a full scan across all social sources.
        Returns aggregated token scores.
        """
        self.scan_count += 1
        all_signals = []
        
        # Scan all sources in parallel
        tasks = [
            self.reddit.scan_for_signals(),
        ]
        
        # Only add Twitter/Telegram if configured
        if self.twitter.bearer_token:
            # Would add Twitter scanning tasks here
            pass
        if self.telegram.bot_token:
            tasks.append(self.telegram.scan_for_signals())
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, list):
                all_signals.extend(result)
        
        # Aggregate by token
        token_signals: Dict[str, List[SocialSignal]] = {}
        for signal in all_signals:
            key = signal.token_symbol.upper()
            if key not in token_signals:
                token_signals[key] = []
            token_signals[key].append(signal)
        
        # Calculate aggregated scores
        for token, signals in token_signals.items():
            total_strength = sum(s.strength for s in signals)
            avg_sentiment = sum(s.sentiment_score for s in signals) / len(signals) if signals else 0
            total_mentions = sum(s.mention_count for s in signals)
            sources = list(set(s.source for s in signals))
            
            # Multi-source bonus: signals from multiple platforms are stronger
            source_multiplier = 1.0 + (len(sources) - 1) * 0.3
            
            self.token_scores[token] = {
                "token": token,
                "aggregated_strength": min(100, total_strength * source_multiplier),
                "avg_sentiment": avg_sentiment,
                "total_mentions": total_mentions,
                "sources": sources,
                "signal_count": len(signals),
                "source_multiplier": source_multiplier,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "mint": next((s.token_mint for s in signals if s.token_mint), ""),
            }
        
        self.all_signals.extend(all_signals)
        # Keep only last 500 signals
        if len(self.all_signals) > 500:
            self.all_signals = self.all_signals[-500:]
        
        return self.token_scores

    def get_top_signals(self, limit: int = 10) -> List[Dict]:
        """Get the top social signals by aggregated strength."""
        sorted_tokens = sorted(
            self.token_scores.values(),
            key=lambda x: x["aggregated_strength"],
            reverse=True,
        )
        return sorted_tokens[:limit]

    def get_state(self) -> Dict:
        """Get social scanner state for dashboard."""
        return {
            "active": self.active,
            "scan_count": self.scan_count,
            "tokens_tracked": len(self.token_scores),
            "total_signals": len(self.all_signals),
            "top_signals": self.get_top_signals(5),
            "sources": {
                "twitter": {
                    "configured": bool(self.twitter.bearer_token),
                    "signals": len(self.twitter.signals),
                },
                "telegram": {
                    "configured": bool(self.telegram.bot_token),
                    "channels": len(self.telegram.monitored_channels),
                    "signals": len(self.telegram.signals),
                },
                "reddit": {
                    "subreddits": len(self.reddit.MEMECOIN_SUBREDDITS),
                    "signals": len(self.reddit.signals),
                },
            },
        }

    async def close(self):
        await self.twitter.close()
        await self.telegram.close()
        await self.reddit.close()
