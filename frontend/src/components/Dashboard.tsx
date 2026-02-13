import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { Deal, Metrics, Position } from '../services/api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell, RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie } from 'recharts';
import { format, parseISO, getDay, getHours } from 'date-fns';
import { KPICard } from './KPICard';
import type { DashboardFilters } from './Sidebar';
import { Activity, TrendingUp, TrendingDown, Flame, Repeat, Gauge, Clock } from 'lucide-react';

const DAY_MAP: { [key: number]: string } = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb'
};
const ALL_TIME_FROM = new Date(2000, 0, 1).toISOString();

import { formatCurrency } from '../utils/format';

type EquityPoint = {
  time: string;
  balance: number;
  ticket: number;
};

export function Dashboard({ filters, onDataLoaded }: { filters: DashboardFilters; onDataLoaded?: (assets: string[], eas: string[]) => void }) {
  const [rawDeals, setRawDeals] = useState<Deal[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'visao' | 'graficos' | 'heatmap' | 'trades'>('visao');
  const [resultLevel, setResultLevel] = useState<'year' | 'month' | 'day'>('year');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const lastResultClickRef = useRef<{ time: number; key: string | null }>({ time: 0, key: null });
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(25);
  const [eaContributionMode, setEaContributionMode] = useState<'valor' | 'percentual'>('valor');
  const [eaContributionTopOnly, setEaContributionTopOnly] = useState(false);
  
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
      const rangeFromDeals = (deals: Deal[]) => {
        if (deals.length === 0) {
          return { min: null, max: null };
        }
        const times = deals.map((deal) => new Date(deal.time).getTime());
        const min = new Date(Math.min(...times)).toISOString();
        const max = new Date(Math.max(...times)).toISOString();
        return { min, max };
      };
      
      // Fetch only deals, calculate metrics locally to support filtering
      const dealsData = await api.getDeals(request);
      setRawDeals(dealsData);
      const allDealsData = await api.getDeals({ date_from: ALL_TIME_FROM, date_to: effectiveDateTo });
      setAllDeals(allDealsData);
      const positionsData = await api.getPositions();
      setOpenPositions(positionsData);
      const periodRange = rangeFromDeals(dealsData);
      const totalRange = rangeFromDeals(allDealsData);
      console.info('[Dashboard] período selecionado', {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        effectiveDateTo,
        request,
        dealsCount: dealsData.length,
        rangeMin: periodRange.min,
        rangeMax: periodRange.max
      });
      console.info('[Dashboard] total histórico', {
        dateFrom: ALL_TIME_FROM,
        dateTo: effectiveDateTo,
        dealsCount: allDealsData.length,
        rangeMin: totalRange.min,
        rangeMax: totalRange.max
      });

      // Extract unique assets and EAs
      // Use dealsData (current period) instead of allDealsData to ensure filters match the selected period
      // Also apply strict date filtering to match the logic in filteredDeals
      const sourceDeals = dealsData.filter(d => new Date(d.time) >= new Date(filters.dateFrom));
      
      if (sourceDeals.length > 0) {
        const assets = [...new Set(sourceDeals.map(d => d.symbol))].sort();
        const eas = [...new Set(sourceDeals.map(d => d.ea_id))].sort();
        
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
      setLastSyncAt(new Date());
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

  useEffect(() => {
    setResultLevel('year');
    setSelectedYear(null);
    setSelectedMonth(null);
  }, [filters.dateFrom, filters.dateTo]);

  // Apply filters and calculate metrics
  useEffect(() => {
    // if (!rawDeals.length) return;

    const filtered = rawDeals.filter(deal => {
      const dealDate = new Date(deal.time);
      const dayName = DAY_MAP[getDay(dealDate)];
      const hour = getHours(dealDate);
      // Date Filter (Safety check for strict period compliance)
      if (new Date(deal.time) < new Date(filters.dateFrom)) {
        return false;
      }
      
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

    console.log(`[Filter] Applied filters. Raw: ${rawDeals.length}, Result: ${filtered.length}`);
    setFilteredDeals(filtered);

    // Calculate metrics locally
    const total_trades = filtered.length;
    const net_profit = filtered.reduce((sum, d) => sum + d.net_profit, 0);
    
    // Calculate Balance Growth
    // 1. Calculate initial balance (sum of profits before dateFrom)
    const historyDeals = allDeals.filter(deal => {
      // Must be before the selected period
      if (new Date(deal.time) >= new Date(filters.dateFrom)) return false;
      
      // Must match current filters (Asset/EA)
      // Note: We deliberately IGNORE day/hour filters for initial balance 
      // because the account balance exists regardless of those specific filters
      if (!filters.selectedAssets.includes('Todos') && !filters.selectedAssets.includes(deal.symbol)) {
        return false;
      }
      if (!filters.selectedEAs.includes('Todos') && !filters.selectedEAs.includes(deal.ea_id)) {
        return false;
      }
      return true;
    });
    
    const balanceStart = historyDeals.reduce((sum, d) => sum + d.net_profit, 0);
    let growthPercentage = 0;
    
    // Logic for growth calculation:
    // If we started with 0 or negative, any profit is technically infinite growth or recovery
    // We'll use a standard variation formula: (End - Start) / |Start|
    if (Math.abs(balanceStart) > 0.01) { // Avoid division by zero
      const balanceEnd = balanceStart + net_profit;
      growthPercentage = ((balanceEnd - balanceStart) / Math.abs(balanceStart)) * 100;
    } else if (net_profit !== 0) {
      // If start is 0, any profit/loss is 100% variation technically, 
      // but let's treat it as 0% reference or handle display separately
      growthPercentage = net_profit > 0 ? 100 : -100; 
    }

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

    // Calculate Average Duration
    const totalDuration = filtered.reduce((sum, deal) => sum + (deal.duration || 0), 0);
    const avgDurationSeconds = filtered.length > 0 ? totalDuration / filtered.length : 0;
    
    setMetrics({
      general: {
        net_profit: net_profit,
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
        max_loss_streak: maxLossStreak,
        period_growth: growthPercentage,
        avg_duration: avgDurationSeconds
      },
      advanced: {},
      sequences: {},
      extremes: {}
    });
    if (filtered.length > 0) {
      const times = filtered.map((deal) => new Date(deal.time).getTime());
      const min = new Date(Math.min(...times)).toISOString();
      const max = new Date(Math.max(...times)).toISOString();
      console.info('[Dashboard] período filtrado aplicado', {
        filteredCount: filtered.length,
        rangeMin: min,
        rangeMax: max,
        assets: filters.selectedAssets,
        eas: filters.selectedEAs,
        days: filters.selectedDays,
        hours: filters.selectedHours
      });
    } else {
      console.info('[Dashboard] período filtrado aplicado', {
        filteredCount: 0,
        assets: filters.selectedAssets,
        eas: filters.selectedEAs,
        days: filters.selectedDays,
        hours: filters.selectedHours
      });
    }

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

  const resultYearMap = filteredDeals.reduce((acc: Record<string, number>, deal) => {
    const year = format(parseISO(deal.time), 'yyyy');
    acc[year] = (acc[year] || 0) + deal.net_profit;
    return acc;
  }, {});
  const resultYearData = Object.entries(resultYearMap)
    .map(([year, profit]) => ({
      label: year,
      profit,
      year: Number(year)
    }))
    .sort((a, b) => a.year - b.year);

  const resultMonthMap = filteredDeals.reduce((acc: Record<string, number>, deal) => {
    const date = parseISO(deal.time);
    const year = date.getFullYear();
    if (selectedYear !== null && year !== selectedYear) {
      return acc;
    }
    const month = date.getMonth() + 1;
    const key = `${String(month).padStart(2, '0')}/${year}`;
    acc[key] = (acc[key] || 0) + deal.net_profit;
    return acc;
  }, {});
  const resultMonthData = Object.entries(resultMonthMap)
    .map(([label, profit]) => ({
      label,
      profit,
      month: Number(label.split('/')[0])
    }))
    .sort((a, b) => a.month - b.month);

  const resultDayMap = filteredDeals.reduce((acc: Record<string, number>, deal) => {
    const date = parseISO(deal.time);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (selectedYear === null || selectedMonth === null || year !== selectedYear || month !== selectedMonth) {
      return acc;
    }
    const dayKey = format(date, 'dd/MM/yyyy');
    acc[dayKey] = (acc[dayKey] || 0) + deal.net_profit;
    return acc;
  }, {});
  const resultDayData = Object.entries(resultDayMap)
    .map(([label, profit]) => ({
      label,
      profit,
      timeValue: parseISO(label.split('/').reverse().join('-')).getTime()
    }))
    .sort((a, b) => a.timeValue - b.timeValue);

  const resultDrilldownData = resultLevel === 'year' ? resultYearData : resultLevel === 'month' ? resultMonthData : resultDayData;
  const resultLevelLabel = resultLevel === 'year' ? 'Ano' : resultLevel === 'month' ? 'Mês' : 'Dia';
  const resultLevelDetail = resultLevel === 'month' && selectedYear !== null
    ? `${selectedYear}`
    : resultLevel === 'day' && selectedYear !== null && selectedMonth !== null
    ? `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`
    : '';
  const handleResultBarClick = (event: { activeLabel?: string | number } | null) => {
    if (!event?.activeLabel) {
      return;
    }
    const key = String(event.activeLabel);
    const now = Date.now();
    const lastClick = lastResultClickRef.current;
    const isDoubleClick = lastClick.key === key && now - lastClick.time < 350;
    lastResultClickRef.current = { time: now, key };
    if (!isDoubleClick) {
      return;
    }
    if (resultLevel === 'year') {
      const year = Number(key);
      if (!Number.isNaN(year)) {
        setSelectedYear(year);
        setSelectedMonth(null);
        setResultLevel('month');
      }
      return;
    }
    if (resultLevel === 'month') {
      const [monthText, yearText] = key.split('/');
      const month = Number(monthText);
      const year = Number(yearText);
      if (!Number.isNaN(month) && !Number.isNaN(year)) {
        setSelectedYear(year);
        setSelectedMonth(month - 1);
        setResultLevel('day');
      }
    }
  };
  const handleResultBack = () => {
    if (resultLevel === 'day') {
      setResultLevel('month');
      setSelectedMonth(null);
      return;
    }
    if (resultLevel === 'month') {
      setResultLevel('year');
      setSelectedYear(null);
      setSelectedMonth(null);
    }
  };

  const sortedDeals = [...filteredDeals].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const tradesTotal = sortedDeals.length;
  const tradesTotalPages = Math.max(1, Math.ceil(tradesTotal / tradesPerPage));
  const tradesPageSafe = Math.min(Math.max(tradesPage, 1), tradesTotalPages);
  const tradesStartIndex = (tradesPageSafe - 1) * tradesPerPage;
  const tradesEndIndex = tradesStartIndex + tradesPerPage;
  const tradesPageData = sortedDeals.slice(tradesStartIndex, tradesEndIndex);
  const lastSyncLabel = lastSyncAt ? format(lastSyncAt, 'dd/MM HH:mm:ss') : 'Sem dados';
  const nextSyncLabel = lastSyncAt
    ? format(new Date(lastSyncAt.getTime() + filters.resyncMinutes * 60 * 1000), 'dd/MM HH:mm:ss')
    : 'Sem dados';
  const formatOptionalPrice = (value: number | null | undefined) => value && value !== 0 ? value : '-';
  const formatPositionTime = (value: string | null) => value ? format(new Date(value), 'dd/MM/yyyy HH:mm') : '-';
  const getPositionChange = (position: Position) => {
    if (!position.price_current || !position.price_open) {
      return null;
    }
    const rawChange = ((position.price_current - position.price_open) / position.price_open) * 100;
    return position.type === 0 ? rawChange : -rawChange;
  };
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
  const openPositionsFiltered = openPositions.filter(position => {
    if (!filters.selectedAssets.includes('Todos') && !filters.selectedAssets.includes(position.symbol)) {
      return false;
    }
    if (!filters.selectedEAs.includes('Todos') && !filters.selectedEAs.includes(position.ea_id)) {
      return false;
    }
    return true;
  });
  const openPositionsCount = openPositionsFiltered.length;
  const openPositionsProfitTotal = openPositionsFiltered.reduce((sum, position) => sum + position.profit, 0);
  const openPositionsSorted = [...openPositionsFiltered].sort((a, b) => {
    if (a.time && b.time) {
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    }
    if (a.time) {
      return -1;
    }
    if (b.time) {
      return 1;
    }
    return b.ticket - a.ticket;
  });
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
  const periodTotalNet = filteredDeals.reduce((sum, deal) => sum + deal.net_profit, 0);
  const periodContributionMap = filteredDeals.reduce((acc: Record<string, number>, deal) => {
    acc[deal.ea_id] = (acc[deal.ea_id] || 0) + deal.net_profit;
    return acc;
  }, {});
  const eaContributionData = Object.keys(periodContributionMap).map((ea) => {
    const periodNet = periodContributionMap[ea] ?? 0;
    // We only care about period data now
    return {
      ea,
      periodNet,
      periodShare: periodTotalNet !== 0 ? periodNet / periodTotalNet : 0,
    };
  }).sort((a, b) => b.periodNet - a.periodNet);

  const eaContributionDisplayBase = eaContributionTopOnly ? eaContributionData.slice(0, 10) : eaContributionData;
  const eaContributionDisplayData = eaContributionDisplayBase.map((entry) => ({
    ...entry,
    periodDisplay: eaContributionMode === 'percentual' ? entry.periodShare * 100 : entry.periodNet,
  }));
  const eaContributionChartHeight = Math.max(320, eaContributionDisplayData.length * 36);

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
          { id: 'trades', label: 'Trades' }
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
            <>
            <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Visão Geral</h3>
            <div className="kpi-grid" style={{ marginBottom: '40px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
              <KPICard 
                title="Evolução do Saldo" 
                value={`${metrics.general.period_growth > 0 ? '+' : ''}${metrics.general.period_growth.toFixed(2)}%`} 
                color={metrics.general.period_growth >= 0 ? "#00ff00" : "#ff4444"}
                icon={Gauge}
              />
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
              <KPICard 
                title="Duração Média" 
                value={metrics.general.avg_duration 
                  ? (() => {
                      const d = Math.floor(metrics.general.avg_duration);
                      const hours = Math.floor(d / 3600);
                      const minutes = Math.floor((d % 3600) / 60);
                      const seconds = d % 60;
                      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })()
                  : '00:00:00'
                }
                icon={Clock}
              />
            </div>
            </>
          )}

          <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333', marginBottom: '40px' }}>
            <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Tempo Real</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              <KPICard 
                title="Atualizado em" 
                value={lastSyncLabel} 
              />
              <KPICard 
                title="Próxima atualização prevista" 
                value={nextSyncLabel} 
              />
              <KPICard 
                title="Operações em andamento" 
                value={openPositionsCount} 
              />
            </div>
            <div style={{ marginTop: '24px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #444', color: '#aaa' }}>
                    <th style={{ padding: '12px' }}>Ativo</th>
                    <th style={{ padding: '12px' }}>Bilhete</th>
                    <th style={{ padding: '12px' }}>Horário</th>
                    <th style={{ padding: '12px' }}>Tipo</th>
                    <th style={{ padding: '12px' }}>Volume</th>
                    <th style={{ padding: '12px' }}>Preço</th>
                    <th style={{ padding: '12px' }}>S / L</th>
                    <th style={{ padding: '12px' }}>T / P</th>
                    <th style={{ padding: '12px' }}>Preço Atual</th>
                    <th style={{ padding: '12px' }}>Lucro</th>
                    <th style={{ padding: '12px' }}>Mudança</th>
                    <th style={{ padding: '12px' }}>ID do EA</th>
                    <th style={{ padding: '12px' }}>Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositionsSorted.length > 0 ? (
                    <>
                      {openPositionsSorted.map(position => {
                        const change = getPositionChange(position);
                        return (
                          <tr key={position.ticket} style={{ borderBottom: '1px solid #333', color: '#e0e0e0' }}>
                            <td style={{ padding: '12px' }}>{position.symbol}</td>
                            <td style={{ padding: '12px' }}>{position.ticket}</td>
                            <td style={{ padding: '12px' }}>{formatPositionTime(position.time)}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                color: position.type === 0 ? '#00aaff' : '#ff9800',
                                fontWeight: 'bold'
                              }}>
                                {position.type === 0 ? 'BUY' : 'SELL'}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>{position.volume}</td>
                            <td style={{ padding: '12px' }}>{position.price_open}</td>
                            <td style={{ padding: '12px' }}>{formatOptionalPrice(position.sl)}</td>
                            <td style={{ padding: '12px' }}>{formatOptionalPrice(position.tp)}</td>
                            <td style={{ padding: '12px' }}>{formatOptionalPrice(position.price_current)}</td>
                            <td style={{ padding: '12px', color: position.profit >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>
                              {formatCurrency(position.profit, position.symbol)}
                            </td>
                            <td style={{ padding: '12px', color: change !== null && change >= 0 ? '#00ff00' : '#ff4444', fontWeight: 600 }}>
                              {change !== null ? `${change.toFixed(2)}%` : '-'}
                            </td>
                            <td style={{ padding: '12px' }}>{position.ea_id}</td>
                            <td style={{ padding: '12px' }}>{position.comment || '-'}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: '1px solid #444', color: '#e0e0e0', fontWeight: 700 }}>
                        <td colSpan={9} style={{ padding: '12px', textAlign: 'right', color: '#aaa' }}>Total</td>
                        <td style={{ padding: '12px', color: openPositionsProfitTotal >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>
                          {formatCurrency(openPositionsProfitTotal, 'BRL')}
                        </td>
                        <td colSpan={3} style={{ padding: '12px' }} />
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={13} style={{ padding: '16px', color: '#666', textAlign: 'center' }}>
                        Sem posições em andamento
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Resultado Diário</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#888', fontSize: '0.85rem' }}>
                  {resultLevelLabel}{resultLevelDetail ? ` • ${resultLevelDetail}` : ''}
                </span>
                {resultLevel !== 'year' && (
                  <button
                    onClick={handleResultBack}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #333',
                      background: '#1b1b1b',
                      color: '#bbb',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Voltar
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: '300px', width: '100%' }}>
              {resultDrilldownData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resultDrilldownData} onClick={handleResultBarClick}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="label" 
                      tickFormatter={(value) => String(value)}
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
                      {resultDrilldownData.map((entry, index) => (
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

          <div className="chart-container" style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Contribuição por EA</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => setEaContributionMode('valor')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: eaContributionMode === 'valor' ? '#00aaff' : '#1b1b1b',
                    color: eaContributionMode === 'valor' ? '#fff' : '#bbb',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Valor
                </button>
                <button
                  onClick={() => setEaContributionMode('percentual')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: eaContributionMode === 'percentual' ? '#00aaff' : '#1b1b1b',
                    color: eaContributionMode === 'percentual' ? '#fff' : '#bbb',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  %
                </button>
                <button
                  onClick={() => setEaContributionTopOnly((value) => !value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: eaContributionTopOnly ? '#00aaff' : '#1b1b1b',
                    color: eaContributionTopOnly ? '#fff' : '#bbb',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Top 10
                </button>
              </div>
            </div>
            <div style={{ height: `${eaContributionChartHeight}px`, width: '100%' }}>
              {eaContributionDisplayData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={eaContributionDisplayData} 
                    layout="vertical" 
                    margin={{ left: 20, right: 20 }}
                    barGap={-25} // Sobreposição das barras
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                    <XAxis 
                      type="number"
                      stroke="#666"
                      tick={{ fill: '#bbb' }}
                      tickFormatter={(value) => {
                        if (eaContributionMode === 'percentual') {
                          return `${Number(value).toFixed(0)}%`;
                        }
                        return formatCurrency(Number(value), 'BRL');
                      }}
                    />
                    <YAxis 
                      type="category"
                      dataKey="ea"
                      stroke="#666"
                      tick={{ fill: '#e0e0e0', fontSize: '0.85rem', textAnchor: 'start', x: 30 }}
                      width={140}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#888', marginBottom: '8px' }}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      formatter={(_value, name, props) => {
                        const payload = props.payload as { periodNet: number; periodShare: number };
                        const isPeriod = name === 'Período';
                        const rawValue = isPeriod ? payload.periodNet : 0;
                        const share = isPeriod ? payload.periodShare : 0;
                        
                        const shareLabel = Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : '0.0%';
                        const valueLabel = formatCurrency(rawValue, 'BRL');
                        
                        return [
                          <span key={name} style={{ color: rawValue >= 0 ? '#4ade80' : '#f87171' }}>
                            {valueLabel} <span style={{ color: '#666', fontSize: '0.8em' }}>({shareLabel})</span>
                          </span>,
                          name
                        ];
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <ReferenceLine x={0} stroke="#444" strokeWidth={1} />
                    
                    {/* Barra de Período */}
                    <Bar dataKey="periodDisplay" name="Período" barSize={20} radius={[0, 4, 4, 0]}>
                      {eaContributionDisplayData.map((entry, index) => (
                        <Cell 
                          key={`cell-period-${index}`} 
                          fill={entry.periodNet >= 0 ? '#4ade80' : '#f87171'} 
                        />
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
          <h3 style={{ marginBottom: '20px', color: '#fff', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Trades</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #444', color: '#aaa' }}>
                  <th style={{ padding: '15px' }}>Abertura</th>
                  <th style={{ padding: '15px' }}>Fechamento</th>
                  <th style={{ padding: '15px' }}>Duração</th>
                  <th style={{ padding: '15px' }}>Ticket (Deal)</th>
                  <th style={{ padding: '15px' }}>ID Posição</th>
                  <th style={{ padding: '15px' }}>Ativo</th>
                  <th style={{ padding: '15px' }}>Tipo</th>
                  <th style={{ padding: '15px' }}>Volume</th>
                  <th style={{ padding: '15px' }}>Preço Entrada</th>
                  <th style={{ padding: '15px' }}>Preço Saída</th>
                  <th style={{ padding: '15px' }}>Pontos</th>
                  <th style={{ padding: '15px' }}>Lucro/Prejuízo</th>
                  <th style={{ padding: '15px' }}>EA</th>
                </tr>
              </thead>
              <tbody>
                {tradesPageData.map((deal) => (
                  <tr key={deal.ticket} style={{ borderBottom: '1px solid #333', color: '#e0e0e0' }}>
                    <td style={{ padding: '15px' }}>
                      {deal.position_open_time 
                        ? format(new Date(deal.position_open_time), 'dd/MM/yyyy HH:mm:ss')
                        : '-'}
                    </td>
                    <td style={{ padding: '15px' }}>{format(new Date(deal.time), 'dd/MM/yyyy HH:mm:ss')}</td>
                    <td style={{ padding: '15px' }}>
                      {deal.duration 
                        ? (() => {
                            const d = Math.floor(deal.duration);
                            const hours = Math.floor(d / 3600);
                            const minutes = Math.floor((d % 3600) / 60);
                            const seconds = d % 60;
                            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                          })()
                        : '-'}
                    </td>
                    <td style={{ padding: '15px' }}>{deal.ticket}</td>
                    <td style={{ padding: '15px' }}>{deal.position_id}</td>
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
                    <td style={{ padding: '15px' }}>{deal.entry_price ?? '-'}</td>
                    <td style={{ padding: '15px' }}>{deal.price}</td>
                    <td style={{ padding: '15px' }}>{deal.points ? deal.points.toFixed(0) : '-'}</td>
                    <td style={{ padding: '15px', color: deal.net_profit >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>
                      {formatCurrency(deal.net_profit, deal.symbol)}
                    </td>
                    <td style={{ padding: '15px' }}>{deal.ea_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#bbb', fontSize: '0.9rem' }}>
              <span>Total: {tradesTotal}</span>
              <span>Página {tradesPageSafe} de {tradesTotalPages}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ color: '#bbb', fontSize: '0.9rem' }}>
                Registros por página
                <select
                  value={tradesPerPage}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setTradesPerPage(value);
                    setTradesPage(1);
                  }}
                  style={{
                    marginLeft: '8px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: '#1b1b1b',
                    color: '#bbb'
                  }}
                >
                  {[10, 25, 50, 100].map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setTradesPage(1)}
                  disabled={tradesPageSafe === 1}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: tradesPageSafe === 1 ? '#151515' : '#1b1b1b',
                    color: tradesPageSafe === 1 ? '#555' : '#bbb',
                    cursor: tradesPageSafe === 1 ? 'default' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  Primeiro
                </button>
                <button
                  onClick={() => setTradesPage(tradesPageSafe - 1)}
                  disabled={tradesPageSafe === 1}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: tradesPageSafe === 1 ? '#151515' : '#1b1b1b',
                    color: tradesPageSafe === 1 ? '#555' : '#bbb',
                    cursor: tradesPageSafe === 1 ? 'default' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  Anterior
                </button>
                <button
                  onClick={() => setTradesPage(tradesPageSafe + 1)}
                  disabled={tradesPageSafe === tradesTotalPages}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: tradesPageSafe === tradesTotalPages ? '#151515' : '#1b1b1b',
                    color: tradesPageSafe === tradesTotalPages ? '#555' : '#bbb',
                    cursor: tradesPageSafe === tradesTotalPages ? 'default' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  Próximo
                </button>
                <button
                  onClick={() => setTradesPage(tradesTotalPages)}
                  disabled={tradesPageSafe === tradesTotalPages}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    background: tradesPageSafe === tradesTotalPages ? '#151515' : '#1b1b1b',
                    color: tradesPageSafe === tradesTotalPages ? '#555' : '#bbb',
                    cursor: tradesPageSafe === tradesTotalPages ? 'default' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  Último
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
