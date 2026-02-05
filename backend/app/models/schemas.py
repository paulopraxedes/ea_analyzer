from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from datetime import datetime

class Deal(BaseModel):
    ticket: int
    order: int
    time: datetime
    time_msc: int
    type: int
    entry: int
    magic: int
    position_id: int
    reason: int
    volume: float
    price: float
    commission: float
    swap: float
    profit: float
    fee: float
    symbol: str
    comment: str
    external_id: str
    # Calculated fields
    net_profit: float
    ea_id: str

class MetricsResponse(BaseModel):
    general: Dict[str, Any]
    advanced: Dict[str, Any]
    sequences: Dict[str, Any]
    extremes: Dict[str, Any]

class AnalysisRequest(BaseModel):
    date_from: datetime
    date_to: datetime
    assets: Optional[List[str]] = None
    magic_numbers: Optional[List[int]] = None
    ea_ids: Optional[List[str]] = None

class ConnectionStatus(BaseModel):
    connected: bool
    version: Optional[tuple] = None
    terminal_info: Optional[Dict[str, Any]] = None
