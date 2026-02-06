import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Deal, Metrics } from '../services/api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell, RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie } from 'recharts';
import { format, parseISO, getDay, getHours } from 'date-fns';
import { KPICard } from './KPICard';
import type { DashboardFilters } from './Sidebar';
import { Activity, TrendingUp, TrendingDown, Flame, Repeat, Gauge } from 'lucide-react';

const DAY_MAP: { [key: number]: string } = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb'
};

import { formatCurrency } from '../utils/format';

type EquityPoint = {
  time: string;
  balance: number;
  ticket: number;
};

type DailyPoint = {
  date: string;
  profit: number;
};

export function Dashboard({ filters, onDataLoaded }: { filters: DashboardFilters; onDataLoaded?: (assets: string[], eas: string[]) => void }) {
  const [rawDeals, setRawDeals] = useState<Deal[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'visao' | 'graficos' | 'heatmap' | 'trades'>('visao');
  
  // Default range: last 5 years to cover everything for now
  // In a real app, this should probably come from the filters or be adjustable
  // const [dateFrom] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString());
  // const [dateTo] = useState(new Date().toISOString());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const toDate = new Date(filters.dateTo);
      const effectiveDateTo = toDate.toDateString() === now.toDateString() ? now.toISOString() : filters.dateTo;
      const request = { date_from: filters.dateFrom, date_to: effectiveDateTo };
      
      // Fetch only deals, calculate metrics locally to support filtering
      const dealsData = await api.getDeals(request);
      setRawDeals(dealsData);

      // Extract unique assets and EAs
      if (dealsData.length > 0) {
        const assets = [...new Set(dealsData.map(d => d.symbol))].sort();
        const eas = [...new Set(dealsData.map(d => d.ea_id))].sort();
        
        if (onDataLoaded) {
          onDataLoaded(assets, eas);
        }
      } else {
        if (onDataLoaded) {
          onDataLoaded([], []);
        }
      }

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, onDataLoaded]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const intervalMinutes = Math.max(1, filters.resyncMinutes);
    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(() => {
      fetchData();
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [fetchData, filters.resyncMinutes]);

  // Apply filters and calculate metrics
  useEffect(() => {
    // if (!rawDeals.length) return;

    const filtered = rawDeals.filter(deal => {
      const dealDate = new Date(deal.time);
      const dayName = DAY_MAP[getDay(dealDate)];
      const hour = getHours(dealDate);
      // Asset Filter
      if (!filters.selectedAssets.includes('Todos') && !filters.selectedAssets.includes(deal.symbol)) {
        return false;
      }

      // EA Filter
      if (!filters.selectedEAs.includes('Todos') && !filters.selectedEAs.includes(deal.ea_id)) {
        return false;
      }

      // Day Filter
      if (!filters.selectedDays.includes(dayName)) {
        return false;
      }

      // Hour Filter
      if (!filters.selectedHours.includes(hour)) {
        return false;
      }

      return true;
    });

    setFilteredDeals(filtered);

    // Calculate metrics locally
    const total_trades = filtered.length;
    const net_profit = filtered.reduce((sum, d) => sum + d.net_profit, 0);
    const wins = filtered.filter(d => d.net_profit >= 0);
    const losses = filtered.filter(d => d.net_profit < 0);
    const gross_profit = wins.reduce((sum, d) => sum + d.net_profit, 0);
    const gross_loss = losses.reduce((sum, d) => sum + d.net_profit, 0); // usually negative
    
    const win_rate = total_trades > 0 ? (wins.length / total_trades) * 100 : 0;
    const profit_factor = Math.abs(gross_loss) > 0 ? gross_profit / Math.abs(gross_loss) : gross_profit > 0 ? 999 : 0;
    const avg_win = wins.length > 0 ? gross_profit / wins.length : 0;
    const avg_loss = losses.length > 0 ? gross_loss / losses.length : 0;
    const total_costs = filtered.reduce((sum, d) => sum + d.commission + d.swap, 0);
    const sortedByTime = [...filtered].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWin = 0;
    let currentLoss = 0;
    sortedByTime.forEach(deal => {
      if (deal.net_profit >= 0) {
        currentWin += 1;
        currentLoss = 0;
        if (currentWin > maxWinStreak) maxWinStreak = currentWin;
      } else {
        currentLoss += 1;
        currentWin = 0;
        if (currentLoss > maxLossStreak) maxLossStreak = currentLoss;
      }
    });

    setMetrics({
      general: {
        net_profit,
        gross_profit,
        gross_loss,
        total_costs,
        total_trades,
        total_wins: wins.length,
        total_losses: losses.length,
        avg_win,
        avg_loss,
        win_rate,
        profit_factor,
        max_win_streak: maxWinStreak,
        max_loss_streak: maxLossStreak
      },
      advanced: {},
      sequences: {},
      extremes: {}
    });

  }, [rawDeals, filters]);

  // Calculate cumulative equity for chart
  const equityData = filteredDeals.reduce<EquityPoint[]>((acc, deal) => {
    const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
    acc.push({
      time: deal.time,
      balance: lastBalance + deal.net_profit,
      ticket: deal.ticket
    });
    return acc;
  }, []);

  // Calculate daily profit for bar chart
  const dailyProfitMap = filteredDeals.reduce((acc: {[key: string]: number}, deal) => {
    const day = format(parseISO(deal.time), 'yyyy-MM-dd');
    acc[day] = (acc[day] || 0) + deal.net_profit;
    return acc;
  }, {});

  const dailyData: DailyPoint[] = Object.entries(dailyProfitMap).map(([date, profit]) => ({
    date,
    profit
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const winRateValue = metrics?.general.win_rate ?? 0;
  const totalTrades = metrics?.general.total_trades ?? 0;
  const totalWins = metrics?.general.total_wins ?? 0;
  const totalLosses = metrics?.general.total_losses ?? 0;
  const tradePieData = [
    { name: 'Vencedoras', value: totalWins, color: '#00ff00' },
    { name: 'Perdedoras', value: totalLosses, color: '#ff4444' }
  ];

  const heatmapHours = [...filters.selectedHours].sort((a, b) => a - b);
  const heatmapDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const heatmapMap = filteredDeals.reduce((acc: Record<string, number>, deal) => {
    const dayName = DAY_MAP[getDay(new Date(deal.time))];
    const hour = getHours(new Date(deal.time));
    const key = `${dayName}-${hour}`;
    acc[key] = (acc[key] || 0) + deal.net_profit;
    return acc;
  }, {});
  const heatmapValues = heatmapDays.flatMap(day => heatmapHours.map(hour => heatmapMap[`${day}-${hour}`] || 0));
  const maxHeatValue = Math.max(1, ...heatmapValues.map(v => Math.abs(v)));
  const getHeatColor = (value: number) => {
    const intensity = Math.min(1, Math.abs(value) / maxHeatValue);
    if (value > 0) {
      return `rgba(0, 255, 0, ${0.15 + intensity * 0.65})`;
    }
    if (value < 0) {
      return `rgba(255, 68, 68, ${0.15 + intensity * 0.65})`;
    }
    return '#1a1a1a';
  };

  const eaStats = filteredDeals.reduce((acc: Record<string, { total: number; wins: number; losses: number; net: number; grossProfit: number; grossLoss: number }>, deal) => {
    const key = deal.ea_id;
    if (!acc[key]) {
      acc[key] = { total: 0, wins: 0, losses: 0, net: 0, grossProfit: 0, grossLoss: 0 };
    }
    acc[key].total += 1;
    acc[key].net += deal.net_profit;
    if (deal.net_profit >= 0) {
      acc[key].wins += 1;
      acc[key].grossProfit += deal.net_profit;
    } else {
      acc[key].losses += 1;
      acc[key].grossLoss += deal.net_profit;
    }
    return acc;
  }, {});
  const topEA = Object.entries(eaStats).sort((a, b) => b[1].net - a[1].net)[0];
  const topEAStats = topEA
    ? {
        name: topEA[0],
        total: topEA[1].total,
        winRate: topEA[1].total > 0 ? (topEA[1].wins / topEA[1].total) * 100 : 0,
        net: topEA[1].net,
        avgWin: topEA[1].wins > 0 ? topEA[1].grossProfit / topEA[1].wins : 0,
        avgLoss: topEA[1].losses > 0 ? topEA[1].grossLoss / topEA[1].losses : 0
      }
    : null;

  if (loading) return <div style={{ padding: '20px', color: '#ccc' }}>Carregando dados...</div>;

  return (
    <div className="dashboard-container" style={{ width: '100%', color: '#e0e0e0', paddingBottom: '90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff' }}>Dashboard de Performance</h2>
        <button 
          onClick={fetchData} 
          className="refresh-btn"
          style={{
            background: '#00aaff',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'background 0.2s'
          }}
        >
          Atualizar Dados
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {[
          { id: 'visao', label: 'Visão Geral' },
          { id: 'graficos', label: 'Gráficos' },
          { id: 'heatmap', label: 'Mapa de Calor' },
          { id: 'trades', label: 'Últimos Trades' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'visao' | 'graficos' | 'heatmap' | 'trades')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #333',
              background: activeTab === tab.id ? '#00aaff' : '#1b1b1b',
              color: activeTab === tab.id ? '#fff' : '#bbb',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'visao' && (
        <>
          {metrics && (
            <div className="kpi-grid" style={{ marginBottom: '40px' }}>
              <KPICard 
                title="Lucro Líquido" 
                value={formatCurrency(metrics.general.net_profit, 'BRL')} 
                color={metrics.general.net_profit >= 0 ? '#00ff00' : '#ff4444'} 
                icon={Activity}
              />
              <KPICard 
                title="Lucro Bruto" 
                value={formatCurrency(metrics.general.gross_profit, 'BRL')} 
                color="#00ff00"
                icon={TrendingUp}
              />
              <KPICard 
                title="Perda Bruta" 
                value={formatCurrency(metrics.general.gross_loss, 'BRL')} 
                color="#ff4444"
                icon={TrendingDown}
              />
              <KPICard 
                title="Fator de Lucro" 
                value={metrics.general.profit_factor?.toFixed(2)} 
                icon={Gauge}
              />
              <KPICard 
                title="Sequência Positiva" 
                value={metrics.general.max_win_streak ?? 0} 
                color="#00ff00"
                icon={Flame}
              />
              <KPICard 
                title="Sequência Negativa" 
                value={metrics.general.max_loss_streak ?? 0} 
                color="#ff4444"
                icon={Repeat}
              />
              <KPICard 
                title="Média de Lucro" 
                value={formatCurrency(metrics.general.avg_win, 'BRL')} 
                color="#00ff00"
                icon={TrendingUp}
              />
              <KPICard 
                title="Média de Perda" 
                value={formatCurrency(metrics.general.avg_loss, 'BRL')} 
                color="#ff4444"
                icon={TrendingDown}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', marginBottom: '40px' }}>
            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
              <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Taxa de Acerto</h3>
              <div style={{ height: '240px', width: '100%', position: 'relative' }}>
                {totalTrades > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="75%"
                        innerRadius="70%"
                        outerRadius="100%"
                        startAngle={180}
                        endAngle={0}
                        data={[{ name: 'Acerto', value: winRateValue }]}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} angleAxisId={0} />
                        <RadialBar dataKey="value" cornerRadius={10} fill="#00aaff" background={{ fill: '#222' }} />
                        <Tooltip cursor={false} content={() => null} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', bottom: '45px', left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>
                      {winRateValue.toFixed(1)}%
                    </div>
                  </>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                    Sem dados para exibir
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
              <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Trades</h3>
              <div style={{ height: '240px', width: '100%', position: 'relative' }}>
                {totalTrades > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={tradePieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                          {tradePieData.map(entry => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -58%)', textAlign: 'center' }}>
                      <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>{totalTrades}</div>
                      <div style={{ color: '#888', fontSize: '0.85rem' }}>Total de Trades</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00ff00', fontSize: '0.9rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00ff00', display: 'inline-block' }} />
                        Vencedoras {totalWins}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4444', fontSize: '0.9rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff4444', display: 'inline-block' }} />
                        Perdedoras {totalLosses}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                    Sem dados para exibir
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
              <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Melhor EA</h3>
              {topEAStats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>{topEAStats.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Net</div>
                      <div style={{ color: topEAStats.net >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>
                        {formatCurrency(topEAStats.net, 'BRL')}
                      </div>
                    </div>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Taxa de Acerto</div>
                      <div style={{ color: '#fff', fontWeight: 'bold' }}>{topEAStats.winRate.toFixed(2)}%</div>
                    </div>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Trades</div>
                      <div style={{ color: '#fff', fontWeight: 'bold' }}>{topEAStats.total}</div>
                    </div>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Média de Lucro</div>
                      <div style={{ color: '#00ff00', fontWeight: 'bold' }}>{formatCurrency(topEAStats.avgWin, 'BRL')}</div>
                    </div>
                    <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Média de Perda</div>
                      <div style={{ color: '#ff4444', fontWeight: 'bold' }}>{formatCurrency(topEAStats.avgLoss, 'BRL')}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#666' }}>Sem dados para exibir</div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'graficos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '40px', minWidth: 0 }}>
          <div className="chart-container" style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Curva de Patrimônio</h3>
            <div style={{ height: '400px', width: '100%' }}>
              {equityData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="time" 
                      tickFormatter={(time) => format(new Date(time), 'dd/MM')}
                      stroke="#666"
                      minTickGap={50}
                      tick={{ fill: '#bbb' }}
                    />
                    <YAxis 
                      stroke="#666" 
                      tick={{ fill: '#bbb' }}
                      tickFormatter={(value) => formatCurrency(value, 'BRL')}
                      width={180}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#222', border: '1px solid #444', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#fff' }}
                      labelFormatter={(label) => {
                        if (typeof label === 'string' || typeof label === 'number') {
                          try {
                            return format(new Date(label), 'dd/MM/yyyy HH:mm');
                          } catch {
                            return String(label);
                          }
                        }
                        return '';
                      }}
                      formatter={(value) => [
                        typeof value === 'number' ? formatCurrency(value, 'BRL') : String(value ?? ''),
                        'Saldo'
                      ]}
                    />
                    <Legend wrapperStyle={{ color: '#e0e0e0' }} />
                    <Line 
                      type="monotone" 
                      dataKey="balance" 
                      name="Saldo Acumulado" 
                      stroke="#00aaff" 
                      strokeWidth={2}
                      dot={false} 
                      activeDot={{ r: 6, fill: '#00aaff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                  Sem dados para exibir
                </div>
              )}
            </div>
          </div>

          <div className="chart-container" style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Resultado Diário</h3>
            <div style={{ height: '300px', width: '100%' }}>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(parseISO(date), 'dd/MM')}
                      stroke="#666"
                      tick={{ fill: '#bbb' }}
                    />
                    <YAxis 
                      stroke="#666" 
                      tick={{ fill: '#bbb' }}
                      tickFormatter={(value) => formatCurrency(value, 'BRL')}
                      width={180}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#222', border: '1px solid #444', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value) => [
                        typeof value === 'number' ? formatCurrency(value, 'BRL') : String(value ?? ''),
                        'Resultado'
                      ]}
                      cursor={{ fill: '#333' }}
                    />
                    <ReferenceLine y={0} stroke="#666" />
                    <Bar dataKey="profit" name="Lucro/Prejuízo">
                      {dailyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#00ff00' : '#ff4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                  Sem dados para exibir
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'heatmap' && (
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Mapa de Calor</h3>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${heatmapHours.length}, minmax(32px, 1fr))`, gap: '6px', alignItems: 'center', minWidth: `${heatmapHours.length * 36 + 80}px` }}>
              <div />
              {heatmapHours.map(hour => (
                <div key={`hour-${hour}`} style={{ color: '#888', fontSize: '0.75rem', textAlign: 'center' }}>
                  {hour}h
                </div>
              ))}
              {heatmapDays.map(day => (
                heatmapHours.map((hour, index) => {
                  const value = heatmapMap[`${day}-${hour}`] || 0;
                  if (index === 0) {
                    return [
                      <div key={`day-${day}`} style={{ color: '#888', fontSize: '0.8rem', textAlign: 'right', paddingRight: '6px' }}>
                        {day}
                      </div>,
                      <div
                        key={`cell-${day}-${hour}`}
                        style={{
                          height: '28px',
                          borderRadius: '4px',
                          background: getHeatColor(value),
                          border: '1px solid #222'
                        }}
                        title={`${day} ${hour}h: ${formatCurrency(value, 'BRL')}`}
                      />
                    ];
                  }
                  return (
                    <div
                      key={`cell-${day}-${hour}`}
                      style={{
                        height: '28px',
                        borderRadius: '4px',
                        background: getHeatColor(value),
                        border: '1px solid #222'
                      }}
                      title={`${day} ${hour}h: ${formatCurrency(value, 'BRL')}`}
                    />
                  );
                })
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trades' && (
        <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Últimos Trades</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #444', color: '#aaa' }}>
                  <th style={{ padding: '15px' }}>Data</th>
                  <th style={{ padding: '15px' }}>Símbolo</th>
                  <th style={{ padding: '15px' }}>Tipo</th>
                  <th style={{ padding: '15px' }}>Volume</th>
                  <th style={{ padding: '15px' }}>Preço</th>
                  <th style={{ padding: '15px' }}>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.slice(-10).reverse().map((deal) => (
                  <tr key={deal.ticket} style={{ borderBottom: '1px solid #333', color: '#e0e0e0' }}>
                    <td style={{ padding: '15px' }}>{format(new Date(deal.time), 'dd/MM/yyyy HH:mm')}</td>
                    <td style={{ padding: '15px' }}>{deal.symbol}</td>
                    <td style={{ padding: '15px' }}>
                      <span style={{ 
                        color: deal.type === 0 ? '#00aaff' : '#ff9800',
                        fontWeight: 'bold'
                      }}>
                        {deal.type === 0 ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td style={{ padding: '15px' }}>{deal.volume}</td>
                    <td style={{ padding: '15px' }}>{deal.price}</td>
                    <td style={{ padding: '15px', color: deal.net_profit >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>
                      {formatCurrency(deal.net_profit, deal.symbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
