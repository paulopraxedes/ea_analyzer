from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from typing import Optional

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "MT5 Analyzer API"
    
    # MT5 Configuration
    MT5_PATH: Optional[str] = None
    
    # Analysis Configuration
    MIN_DAYS_FOR_SHARPE: int = 30
    
    class Config:
        case_sensitive = True
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
