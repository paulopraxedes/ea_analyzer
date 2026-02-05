from fastapi import APIRouter, HTTPException
from app.services.mt5_service import mt5_service
from app.models.schemas import AnalysisRequest, MetricsResponse, Deal, ConnectionStatus
from typing import List

router = APIRouter()

@router.get("/status", response_model=ConnectionStatus)
def get_status():
    info = mt5_service.get_terminal_info()
    return ConnectionStatus(
        connected=mt5_service.is_connected,
        terminal_info=info
    )

@router.post("/connect")
def connect_mt5():
    if mt5_service.connect():
        return {"status": "connected"}
    raise HTTPException(status_code=500, detail="Failed to connect to MT5")

@router.post("/deals", response_model=List[Deal])
def get_deals(request: AnalysisRequest):
    df = mt5_service.fetch_deals(request.date_from, request.date_to)
    
    if df.empty:
        return []

    # Apply filters
    if request.assets:
        df = df[df["symbol"].isin(request.assets)]
    if request.ea_ids:
        df = df[df["ea_id"].isin(request.ea_ids)]
        
    # Handle NaN values for JSON safety
    df = df.fillna(0)
    
    return df.to_dict(orient="records")

@router.post("/metrics", response_model=MetricsResponse)
def get_metrics(request: AnalysisRequest):
    df = mt5_service.fetch_deals(request.date_from, request.date_to)
    
    if df.empty:
        return mt5_service._get_empty_metrics()

    # Apply filters
    if request.assets:
        df = df[df["symbol"].isin(request.assets)]
    if request.ea_ids:
        df = df[df["ea_id"].isin(request.ea_ids)]
        
    return mt5_service.calculate_metrics(df)
