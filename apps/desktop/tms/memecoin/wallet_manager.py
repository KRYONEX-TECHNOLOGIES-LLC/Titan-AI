"""
Solana Wallet Manager - Secure key management and transaction signing
=====================================================================
Handles wallet operations for the memecoin engine.
Uses environment variables for key storage -- NEVER hardcode keys.
"""

import os
import base64
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class WalletState:
    """Current wallet state."""
    pubkey: str = ""
    sol_balance: float = 0.0
    token_balances: Dict[str, float] = field(default_factory=dict)
    last_updated: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "pubkey": self.pubkey[:8] + "..." + self.pubkey[-4:] if len(self.pubkey) > 12 else self.pubkey,
            "sol_balance": self.sol_balance,
            "token_count": len(self.token_balances),
            "last_updated": self.last_updated,
        }


class SolanaWalletManager:
    """
    Manages Solana wallet operations.
    
    Security:
    - Private key loaded from environment variable only
    - Never logged, never stored in memory longer than needed
    - Transaction signing happens in isolated scope
    """

    def __init__(self):
        self.pubkey = os.getenv("SOLANA_WALLET_PUBKEY", "")
        self._has_private_key = bool(os.getenv("SOLANA_WALLET_PRIVATE_KEY", ""))
        self.state = WalletState(pubkey=self.pubkey)
        self.transaction_history: List[Dict] = []

    @property
    def is_configured(self) -> bool:
        return bool(self.pubkey)

    @property
    def can_sign(self) -> bool:
        return self._has_private_key

    async def sign_and_send_transaction(
        self,
        serialized_tx: str,
        rpc_url: str = "https://api.mainnet-beta.solana.com",
    ) -> Dict:
        """
        Sign a serialized transaction and send it to the network.
        
        This requires the solders/solana-py library for actual signing.
        The transaction comes pre-built from Jupiter API.
        """
        if not self.can_sign:
            return {
                "success": False,
                "error": "Private key not configured. Set SOLANA_WALLET_PRIVATE_KEY in .env",
            }
        
        try:
            # Import solana libraries
            from solders.keypair import Keypair
            from solders.transaction import VersionedTransaction
            from solana.rpc.async_api import AsyncClient
            
            # Load private key from environment
            private_key_str = os.getenv("SOLANA_WALLET_PRIVATE_KEY", "")
            
            # Support both base58 and JSON array formats
            try:
                keypair = Keypair.from_base58_string(private_key_str)
            except Exception:
                try:
                    key_bytes = json.loads(private_key_str)
                    keypair = Keypair.from_bytes(bytes(key_bytes))
                except Exception:
                    return {"success": False, "error": "Invalid private key format"}
            
            # Decode and sign transaction
            tx_bytes = base64.b64decode(serialized_tx)
            tx = VersionedTransaction.from_bytes(tx_bytes)
            
            # Sign
            tx.sign([keypair])
            
            # Send
            async with AsyncClient(rpc_url) as client:
                result = await client.send_transaction(tx)
                
                signature = str(result.value)
                
                self.transaction_history.append({
                    "signature": signature,
                    "time": datetime.now(timezone.utc).isoformat(),
                    "status": "sent",
                })
                
                return {
                    "success": True,
                    "signature": signature,
                    "explorer_url": f"https://solscan.io/tx/{signature}",
                }
                
        except ImportError:
            return {
                "success": False,
                "error": "solders/solana-py not installed. Run: pip install solders solana",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Transaction failed: {str(e)}",
            }

    def get_state(self) -> Dict:
        return {
            "configured": self.is_configured,
            "can_sign": self.can_sign,
            "wallet": self.state.to_dict(),
            "recent_transactions": self.transaction_history[-10:],
        }
