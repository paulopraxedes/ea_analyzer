import MetaTrader5 as mt5
import pandas as pd
import numpy as np
import hashlib
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from functools import lru_cache

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class MT5Service:
    def __init__(self):
        self._connected = False
        self._metrics_cache: Dict[str, Dict[str, Any]] = {}
        self.all_deals: pd.DataFrame = pd.DataFrame()

    @property
    def is_connected(self) -> bool:
        """Checks if MT5 connection is active."""
        is_conn = self._connected and mt5.terminal_info() is not None
        if not is_conn and self._connected:
            self._connected = False
        return is_conn

    def connect(self) -> bool:
        """Establishes connection to MT5 terminal."""
        if self._connected:
            return True
        
        init_params = {}
        if settings.MT5_PATH:
            init_params["path"] = settings.MT5_PATH
        
        try:
            if not mt5.initialize(**init_params):
                error_code, error_desc = mt5.last_error()
                logger.error(f"Failed to initialize MT5 (code {error_code}): {error_desc}")
                return False
            
            self._connected = True
            logger.info("Connected to MetaTrader 5")
            return True
            
        except Exception as e:
            logger.error(f"Exception connecting to MT5: {e}")
            return False

    def shutdown(self) -> None:
        """Closes MT5 connection."""
        if self._connected:
            mt5.shutdown()
            self._connected = False

    def get_terminal_info(self) -> Optional[Dict[str, Any]]:
        if not self.is_connected and not self.connect():
            return None
        info = mt5.terminal_info()
        if info:
            return info._asdict()
        return None

    def fetch_deals(self, date_from: datetime, date_to: datetime) -> pd.DataFrame:
        """Fetches deals from MT5 history."""
        if not self.is_connected and not self.connect():
            return pd.DataFrame()

        try:
            deals = mt5.history_deals_get(date_from, date_to)
            
            if deals is None or len(deals) == 0:
                return pd.DataFrame()

            df = pd.DataFrame(list(deals), columns=deals[0]._asdict().keys())
            df["time"] = pd.to_datetime(df["time"], unit="s")
            
            # Filter for entry types (IN/OUT/INOUT) - actually we want OUT/INOUT for results
            # logic from analyzer.py: entry in [1, 2, 3] (ENTRY_OUT, ENTRY_INOUT, ENTRY_OUT_BY)
            df = df[df["entry"].isin([1, 2, 3])].copy()
            
            df["net_profit"] = df["profit"] + df["commission"] + df["swap"]
            
            def create_ea_id(row):
                if row["magic"] == 0:
                    return "Manual"
                return f"EA {int(row['magic'])}"
            
            df["ea_id"] = df.apply(create_ea_id, axis=1)
            self.all_deals = df
            return df
            
        except Exception as e:
            logger.error(f"Error fetching deals: {e}")
            return pd.DataFrame()

    def _get_dataframe_hash(self, df: pd.DataFrame) -> str:
        if df.empty:
            return "empty"
        try:
            df_bytes = pd.util.hash_pandas_object(df, index=True).values
            return hashlib.md5(df_bytes).hexdigest()
        except Exception:
            return str(len(df))

    def _get_empty_metrics(self) -> Dict[str, Any]:
        return {
            "general": {
                "net_profit": 0.0,
                "profit_factor": 0.0,
                "win_rate": 0.0,
                "total_trades": 0
            },
            "advanced": {
                "expectancy": 0.0,
                "sharpe_ratio": None,
                "recovery_factor": 0.0,
                "z_score": None,
                "std_dev": 0.0
            },
            "sequences": {
                "max_consecutive_wins": 0,
                "max_consecutive_losses": 0
            },
            "extremes": {
                "max_profit": 0.0,
                "max_loss": 0.0,
                "max_drawdown": 0.0
            }
        }

    def _calculate_z_score(self, data: pd.Series) -> Optional[float]:
        if len(data) < 2:
            return None
        try:
            wins_bin = (data > 0).astype(int).values
            n = len(wins_bin)
            n_wins = int(wins_bin.sum())
            n_losses = n - n_wins
            
            if n_wins == 0 or n_losses == 0:
                return None
            
            num_runs = 1
            for i in range(1, n):
                if wins_bin[i] != wins_bin[i-1]:
                    num_runs += 1
            
            expected_runs = ((2 * n_wins * n_losses) / n) + 1
            variance_runs = ((2 * n_wins * n_losses * (2 * n_wins * n_losses - n)) / (n * n * (n - 1)))
            
            if variance_runs <= 1e-10:
                return None
            
            return (num_runs - expected_runs) / np.sqrt(variance_runs)
        except Exception:
            return None

    def _max_consecutive(self, data: pd.Series, is_win_sequence: bool = True) -> int:
        max_seq = 0
        current_seq = 0
        for val in data:
            is_win = val > 0
            if is_win == is_win_sequence:
                current_seq += 1
                max_seq = max(max_seq, current_seq)
            else:
                current_seq = 0
        return max_seq

    def calculate_metrics(self, df: pd.DataFrame) -> Dict[str, Any]:
        if df.empty:
            return self._get_empty_metrics()

        df_hash = self._get_dataframe_hash(df)
        if df_hash in self._metrics_cache:
            return self._metrics_cache[df_hash]

        try:
            total_ops = len(df)
            returns = df["net_profit"]
            wins = returns[returns > 0]
            losses = returns[returns <= 0]
            
            gross_profit = wins.sum()
            gross_loss = losses.sum()
            net_profit = gross_profit + gross_loss
            n_wins = len(wins)
            n_losses = len(losses)
            
            # Costs
            total_commission = df["commission"].sum()
            total_swap = df["swap"].sum()
            total_costs = total_commission + total_swap

            # Profit Factor
            if abs(gross_loss) < 1e-10:
                profit_factor = float("inf") if gross_profit > 0 else 1.0
            else:
                profit_factor = gross_profit / abs(gross_loss)
            
            win_rate = (n_wins / total_ops) * 100 if total_ops > 0 else 0
            
            # Drawdown
            cum_profit = returns.cumsum()
            max_peak = cum_profit.cummax()
            drawdown = max_peak - cum_profit
            max_drawdown = drawdown.max()
            
            # Expectancy
            avg_win = wins.mean() if not wins.empty else 0.0
            avg_loss = losses.mean() if not losses.empty else 0.0
            expectancy = ((n_wins/total_ops) * avg_win) + ((n_losses/total_ops) * avg_loss) if total_ops > 0 else 0.0
            
            # Sharpe
            daily_returns = df.groupby(df["time"].dt.date)["net_profit"].sum()
            sharpe = None
            if len(daily_returns) >= settings.MIN_DAYS_FOR_SHARPE:
                std_dev = daily_returns.std()
                if std_dev > 1e-10:
                    sharpe = (daily_returns.mean() / std_dev) * np.sqrt(252)
            
            recovery_factor = net_profit / max_drawdown if max_drawdown > 1e-10 else 0.0
            
            metrics = {
                "general": {
                    "net_profit": net_profit,
                    "gross_profit": gross_profit,
                    "gross_loss": gross_loss,
                    "total_costs": total_costs,
                    "profit_factor": profit_factor,
                    "win_rate": win_rate,
                    "total_trades": total_ops,
                    "total_wins": n_wins,
                    "total_losses": n_losses,
                    "avg_win": avg_win,
                    "avg_loss": avg_loss
                },
                "advanced": {
                    "expectancy": expectancy,
                    "sharpe_ratio": sharpe,
                    "recovery_factor": recovery_factor,
                    "z_score": self._calculate_z_score(returns),
                    "std_dev": returns.std()
                },
                "sequences": {
                    "max_consecutive_wins": self._max_consecutive(returns, True),
                    "max_consecutive_losses": self._max_consecutive(returns, False)
                },
                "extremes": {
                    "max_profit": wins.max() if not wins.empty else 0.0,
                    "max_loss": losses.min() if not losses.empty else 0.0,
                    "max_drawdown": max_drawdown
                }
            }
            
            self._metrics_cache[df_hash] = metrics
            return metrics
            
        except Exception as e:
            logger.error(f"Error calculating metrics: {e}")
            return self._get_empty_metrics()

mt5_service = MT5Service()
