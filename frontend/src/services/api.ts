
export interface Deal {
  ticket: number;
  time: string;
  type: number;
  entry: number;
  volume: number;
  price: number;
  price_sl: number | null;
  price_tp: number | null;
  profit: number;
  commission: number;
  swap: number;
  symbol: string;
  comment: string;
  net_profit: number;
  ea_id: string;
}

export interface Position {
  ticket: number;
  time: string | null;
  type: number;
  magic: number;
  volume: number;
  price_open: number;
  price_current: number | null;
  sl: number | null;
  tp: number | null;
  profit: number;
  symbol: string;
  ea_id: string;
  comment: string | null;
}

export interface Metrics {
  general: {
    net_profit: number;
    gross_profit: number;
    gross_loss: number;
    total_costs: number;
    total_trades: number;
    total_wins: number;
    total_losses: number;
    avg_win: number;
    avg_loss: number;
    win_rate: number;
    profit_factor: number;
    [key: string]: number;
  };
  advanced: Record<string, unknown>;
  sequences: Record<string, unknown>;
  extremes: Record<string, unknown>;
}

export interface AnalysisRequest {
  date_from: string;
  date_to: string;
  assets?: string[];
  ea_ids?: string[];
}

const API_URL = 'http://127.0.0.1:8000/api/v1';

export const api = {
  getStatus: async () => {
    const response = await fetch(`${API_URL}/status`);
    return response.json();
  },
  
  connect: async () => {
    const response = await fetch(`${API_URL}/connect`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to connect');
    return response.json();
  },

  getDeals: async (params: AnalysisRequest) => {
    const response = await fetch(`${API_URL}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json() as Promise<Deal[]>;
  },

  getPositions: async () => {
    const response = await fetch(`${API_URL}/positions`);
    return response.json() as Promise<Position[]>;
  },

  getMetrics: async (params: AnalysisRequest) => {
    const response = await fetch(`${API_URL}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json() as Promise<Metrics>;
  }
};
