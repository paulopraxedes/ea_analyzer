# CHANGELOG
# v4.3.0 (05/02/2026) - Dashboard Completo com Títulos e Legendas Detalhadas
# - Feature: Todos os gráficos agora têm títulos descritivos e informativos
# - Feature: Legendas explicando o que cada gráfico representa
# - Feature: Anotações de valores importantes nos gráficos
# - Feature: Cores mais intuitivas e consistentes
# - Feature: Formatação de valores em reais (R$) em todos os gráficos
# - Feature: Eixos com labels claros e informativos
# - Melhoria: Espaçamento otimizado entre gráficos
# - Melhoria: Fontes maiores para melhor legibilidade
# - Melhoria: Grid sutil para facilitar leitura de valores
#
# v4.2.0 (05/02/2026) - Dashboard Profissional e Gráficos Informativos
# - Feature: Novo layout de 6 gráficos otimizado para análise de trading
# - Feature: Gráfico de Performance Diária (lucro por dia com média móvel)
# - Feature: Gráfico de Distribuição por Período (manhã/tarde/noite)
# - Feature: Estatísticas de Operações (wins/losses/breakeven em pizza)
# - Feature: Top 10 Melhores e Piores Trades
# - Feature: Evolução Patrimonial com linha de tendência
# - Feature: Análise de Drawdown visualizado
# - Melhoria: Títulos descritivos em todos os gráficos
# - Melhoria: Legendas explicativas e cores intuitivas
# - Melhoria: Grid e formatação profissional
# - Correção: Heatmap removido (substituído por gráficos mais úteis)
#
# [Histórico anterior mantido...]

import MetaTrader5 as mt5
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.ticker as ticker
import tkinter as tk
from tkinter import messagebox, filedialog
import customtkinter as ctk
import seaborn as sns
import atexit
import json
import os
import logging
import hashlib
from typing import Dict, Any, Optional, List, Tuple, Callable
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor
import threading
import matplotlib.font_manager as fm

# ===========================
# CONFIGURAÇÃO DE LOGGING
# ===========================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mt5_analyzer.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ===========================
# CONFIGURAÇÕES DE APARÊNCIA
# ===========================

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# ===========================
# CONSTANTES
# ===========================

CONFIG_FILE = "config.json"
CONFIG_VERSION = "1.0"
MAX_PERIOD_DAYS = 365 * 5  # 5 anos
MIN_DAYS_FOR_SHARPE = 30  # Mínimo de dias para Sharpe confiável
COMMON_MT5_PATHS = [
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files (x86)\MetaTrader 5\terminal.exe",
    r"C:\Program Files\MetaTrader 5 - XP\terminal64.exe",
    r"C:\Program Files\MetaTrader 5 - Modal\terminal64.exe",
    r"C:\Program Files\MetaTrader 5 - Clear\terminal64.exe",
    r"C:\Program Files\MetaTrader 5 - Rico\terminal64.exe",
]


class ConfigManager:
    """
    Gerencia o arquivo de configuração JSON para persistência de preferências do usuário.
    Implementa versionamento e migração automática de configurações.
    """
    
    @staticmethod
    def load_config() -> Dict[str, Any]:
        """
        Carrega configurações do arquivo JSON com suporte a migração de versões.
        :return: Dicionário com configurações ou dicionário vazio se arquivo não existir.
        """
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    
                # Verifica versionamento e migra se necessário
                loaded_version = config.get("version", "0.0")
                if loaded_version != CONFIG_VERSION:
                    logger.info(f"Migrando configuração de v{loaded_version} para v{CONFIG_VERSION}")
                    config = ConfigManager._migrate_config(config, loaded_version)
                    
                return config
            except (json.JSONDecodeError, IOError) as e:
                logger.error(f"Erro ao carregar configuração: {e}")
                return ConfigManager._get_default_config()
        
        return ConfigManager._get_default_config()
    
    @staticmethod
    def _get_default_config() -> Dict[str, Any]:
        """Retorna configuração padrão."""
        return {
            "version": CONFIG_VERSION,
            "mt5_path": "",
            "last_update": datetime.now().isoformat()
        }
    
    @staticmethod
    def _migrate_config(old_config: Dict[str, Any], from_version: str) -> Dict[str, Any]:
        """
        Migra configuração de versões antigas para a versão atual.
        :param old_config: Configuração antiga.
        :param from_version: Versão da configuração antiga.
        :return: Configuração migrada.
        """
        new_config = ConfigManager._get_default_config()
        
        # Preserva dados compatíveis
        if "mt5_path" in old_config:
            new_config["mt5_path"] = old_config["mt5_path"]
        
        logger.info(f"Configuração migrada com sucesso de v{from_version} para v{CONFIG_VERSION}")
        return new_config
    
    @staticmethod
    def save_config(config: Dict[str, Any]) -> bool:
        """
        Salva configurações no arquivo JSON.
        :param config: Dicionário com configurações a serem salvas.
        :return: True se salvo com sucesso, False caso contrário.
        """
        try:
            # Garante que a versão está presente
            config["version"] = CONFIG_VERSION
            config["last_update"] = datetime.now().isoformat()
            
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=4, ensure_ascii=False)
            
            logger.info("Configuração salva com sucesso")
            return True
        except IOError as e:
            logger.error(f"Erro ao salvar configuração: {e}")
            return False
    
    @staticmethod
    def detect_mt5_installation() -> Optional[str]:
        """
        Tenta detectar automaticamente uma instalação válida do MetaTrader 5.
        Verifica caminhos comuns e retorna o primeiro encontrado.
        :return: Caminho do executável MT5 ou None se não encontrado.
        """
        for path in COMMON_MT5_PATHS:
            if ConfigManager.validate_mt5_path(path):
                logger.info(f"MT5 detectado automaticamente em: {path}")
                return path
        
        logger.warning("Nenhuma instalação MT5 detectada automaticamente")
        return None
    
    @staticmethod
    def validate_mt5_path(path: str) -> bool:
        """
        Valida se o caminho aponta para um executável MT5 válido.
        :param path: Caminho a ser validado.
        :return: True se válido, False caso contrário.
        """
        if not path or not os.path.isfile(path):
            return False
        
        filename = os.path.basename(path).lower()
        is_valid = filename in ["terminal64.exe", "terminal.exe"]
        
        if not is_valid:
            logger.warning(f"Caminho inválido para MT5: {path}")
        
        return is_valid


class MT5DataManager:
    """
    Gerencia a conexão com o MetaTrader 5, a extração de dados do histórico
    e o cálculo de todas as métricas de performance e estatísticas avançadas.
    Implementa cache de métricas e processamento assíncrono.
    """
    
    def __init__(self, mt5_path: Optional[str] = None) -> None:
        """
        Inicializa o gerenciador de dados.
        :param mt5_path: Caminho opcional para o executável do MetaTrader 5.
                         Se None, o MT5 será procurado no caminho padrão do sistema.
        """
        self.mt5_path = mt5_path
        self.all_deals: pd.DataFrame = pd.DataFrame()
        self.metrics: Dict[str, Any] = {}
        self._connected: bool = False
        self._metrics_cache: Dict[str, Dict[str, Any]] = {}
        self._executor = ThreadPoolExecutor(max_workers=2)
        
        logger.info(f"MT5DataManager inicializado com path: {mt5_path or 'padrão'}")

    @property
    def is_connected(self) -> bool:
        """Retorna True se há uma conexão ativa com o MT5."""
        is_conn = self._connected and mt5.terminal_info() is not None
        if not is_conn and self._connected:
            logger.warning("Conexão MT5 perdida")
            self._connected = False
        return is_conn

    def connect(self) -> bool:
        """
        Estabelece conexão com o terminal MT5. Garante que o MT5 seja desligado
        ao final da execução do programa.
        :return: True se a conexão for bem-sucedida, False caso contrário.
        """
        if self._connected:
            logger.debug("MT5 já está conectado")
            return True
        
        init_params = {}
        if self.mt5_path:
            if not ConfigManager.validate_mt5_path(self.mt5_path):
                logger.error(f"Caminho MT5 inválido: {self.mt5_path}")
                return False
            init_params["path"] = self.mt5_path
        
        try:
            if not mt5.initialize(**init_params):
                error_code, error_desc = mt5.last_error()
                logger.error(f"Falha ao inicializar MT5 (código {error_code}): {error_desc}")
                return False
            
            self._connected = True
            terminal_info = mt5.terminal_info()
            logger.info(f"Conectado ao MetaTrader 5 com sucesso! (Path: {self.mt5_path or 'padrão'})")
            logger.info(f"Terminal: {terminal_info.name if terminal_info else 'Desconhecido'}")
            atexit.register(self.shutdown)
            return True
            
        except Exception as e:
            logger.error(f"Exceção ao conectar MT5: {e}")
            return False

    def shutdown(self) -> None:
        """
        Encerra a conexão com o MT5 de forma segura.
        """
        if self._connected:
            try:
                mt5.shutdown()
                self._connected = False
                logger.info("Conexão com MetaTrader 5 encerrada com sucesso")
            except Exception as e:
                logger.error(f"Erro ao encerrar MT5: {e}")
        
        # Encerra thread pool
        self._executor.shutdown(wait=False)

    def fetch_deals(self, date_from: datetime, date_to: datetime) -> pd.DataFrame:
        """
        Extrai o histórico de negócios (deals) do MT5 para o período especificado.
        Calcula o lucro líquido por trade e cria um identificador único para cada EA.
        
        IMPORTANTE: ea_id agora agrupa corretamente por Magic Number:
        - Se magic != 0: usa apenas o magic number (ex: "M:102030")
        - Se magic == 0: agrupa todas operações manuais como "Manual"
        
        :param date_from: Data e hora de início do período.
        :param date_to: Data e hora de fim do período.
        :return: DataFrame do Pandas com os deals, ou DataFrame vazio se não houver dados.
        """
        if not self.is_connected:
            logger.warning("MT5 não está conectado. Tentando reconectar...")
            if not self.connect():
                logger.error("Falha ao reconectar ao MT5")
                return pd.DataFrame()

        try:
            logger.info(f"Buscando deals de {date_from} até {date_to}")
            deals = mt5.history_deals_get(date_from, date_to)
            
            if deals is None or len(deals) == 0:
                logger.warning("Nenhum deal encontrado no período especificado")
                return pd.DataFrame()

            df = pd.DataFrame(list(deals), columns=deals[0]._asdict().keys())
            df["time"] = pd.to_datetime(df["time"], unit="s")
            
            # Filtra apenas operações que representam saídas (fechamento de posição)
            df = df[df["entry"].isin([1, 2, 3])].copy()
            
            # Calcula o net_profit por trade
            df["net_profit"] = df["profit"] + df["commission"] + df["swap"]
            
            # CORREÇÃO CRÍTICA: ea_id agora agrupa apenas por Magic Number
            def create_ea_id(row):
                if row["magic"] != 0:
                    # Robô: usa apenas magic number
                    return f"M:{int(row['magic'])}"
                else:
                    # Manual: todas agrupadas
                    return "Manual"
            
            df["ea_id"] = df.apply(create_ea_id, axis=1)
            
            # Log detalhado para debug
            unique_magics = df["magic"].nunique()
            unique_ea_ids = df["ea_id"].nunique()
            manual_count = len(df[df["magic"] == 0])
            
            logger.info(f"{len(df)} deals carregados com sucesso")
            logger.info(f"Magic Numbers únicos: {unique_magics}")
            logger.info(f"EA IDs únicos: {unique_ea_ids}")
            logger.info(f"Operações manuais: {manual_count}")
            
            self.all_deals = df
            return df
            
        except Exception as e:
            logger.error(f"Erro ao buscar deals: {e}", exc_info=True)
            return pd.DataFrame()

    def fetch_deals_async(self, date_from: datetime, date_to: datetime, 
                          callback: Callable[[Optional[pd.DataFrame], Optional[Exception]], None]) -> None:
        """
        Busca deals em background thread para não bloquear a UI.
        :param date_from: Data de início.
        :param date_to: Data de fim.
        :param callback: Função a ser chamada com (DataFrame, Exception).
        """
        def fetch():
            try:
                logger.info("Iniciando busca assíncrona de deals")
                deals = self.fetch_deals(date_from, date_to)
                callback(deals, None)
            except Exception as e:
                logger.error(f"Erro na busca assíncrona: {e}", exc_info=True)
                callback(None, e)
        
        self._executor.submit(fetch)

    def _get_dataframe_hash(self, df: pd.DataFrame) -> str:
        """
        Gera hash único para um DataFrame para uso em cache.
        :param df: DataFrame a ser hasheado.
        :return: String com hash MD5.
        """
        if df.empty:
            return "empty"
        
        try:
            # Usa hash do pandas para gerar identificador único
            df_bytes = pd.util.hash_pandas_object(df, index=True).values
            return hashlib.md5(df_bytes).hexdigest()
        except Exception as e:
            logger.warning(f"Erro ao gerar hash do DataFrame: {e}")
            return str(len(df))

    def _get_empty_metrics(self) -> Dict[str, Any]:
        """
        Retorna estrutura de métricas vazias.
        :return: Dicionário com métricas zeradas.
        """
        return {
            "--- GERAL ---": "",
            "Resultado Líquido": 0.0,
            "Fator de Lucro": 0.0,
            "Assertividade (%)": 0.0,
            "Total Operações": 0,
            "--- ESTATÍSTICAS AVANÇADAS ---": "",
            "Expectativa Matemática": 0.0,
            "Índice Sharpe": np.nan,
            "Fator de Recuperação": 0.0,
            "Z-Score (Sequenciamento)": np.nan,
            "Desvio Padrão (Retornos)": 0.0,
            "--- SEQUÊNCIAS ---": "",
            "Máx Vitórias Seguidas": 0,
            "Máx Derrotas Seguidas": 0,
            "--- EXTREMOS ---": "",
            "Maior Lucro": 0.0,
            "Maior Prejuízo": 0.0,
            "Máx Drawdown": 0.0
        }

    def calculate_metrics(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Calcula métricas de performance e estatísticas avançadas com cache.
        :param df: DataFrame com os deals filtrados.
        :return: Dicionário com todas as métricas calculadas.
        """
        if df.empty:
            logger.debug("DataFrame vazio - retornando métricas vazias")
            self.metrics = self._get_empty_metrics()
            return self.metrics

        # Verifica cache
        df_hash = self._get_dataframe_hash(df)
        if df_hash in self._metrics_cache:
            logger.debug("Usando métricas em cache")
            self.metrics = self._metrics_cache[df_hash]
            return self.metrics

        logger.info(f"Calculando métricas para {len(df)} trades")
        
        try:
            # Proteção contra divisão por zero
            total_ops = len(df)
            if total_ops == 0:
                self.metrics = self._get_empty_metrics()
                return self.metrics

            returns: pd.Series = df["net_profit"]
            wins: pd.Series = returns[returns > 0]
            losses: pd.Series = returns[returns <= 0]

            res_bruto: float = wins.sum()
            prej_bruto: float = losses.sum()
            res_liquido: float = res_bruto + prej_bruto
            n_wins: int = len(wins)
            n_losses: int = len(losses)
            
            # Profit Factor com tratamento especial
            if abs(prej_bruto) < 1e-10:  # Praticamente zero
                fator_lucro: float = float("inf") if res_bruto > 0 else 1.0
            else:
                fator_lucro = res_bruto / abs(prej_bruto)
            
            assertividade: float = (n_wins / total_ops) * 100
            
            # Drawdown - NÃO adiciona cum_profit ao DataFrame original
            cum_profit_temp = returns.cumsum()
            max_peak: pd.Series = cum_profit_temp.cummax()
            drawdown: pd.Series = max_peak - cum_profit_temp
            max_drawdown: float = drawdown.max()
            
            # Expectancy
            avg_win: float = wins.mean() if not wins.empty else 0.0
            avg_loss: float = abs(losses.mean()) if not losses.empty else 0.0
            expectancy: float = ((n_wins/total_ops) * avg_win) - ((n_losses/total_ops) * avg_loss)

            # Sharpe Ratio com validação de dados mínimos
            daily_returns: pd.Series = df.groupby(df["time"].dt.date)["net_profit"].sum()
            sharpe: float = np.nan
            
            if len(daily_returns) >= MIN_DAYS_FOR_SHARPE:
                std_dev = daily_returns.std()
                if std_dev > 1e-10:  # Evita divisão por zero
                    sharpe = (daily_returns.mean() / std_dev) * np.sqrt(252)
                    logger.debug(f"Sharpe calculado: {sharpe:.2f} ({len(daily_returns)} dias)")
                else:
                    logger.warning("Desvio padrão muito baixo para Sharpe confiável")
            else:
                logger.warning(f"Dados insuficientes para Sharpe: {len(daily_returns)} dias (mínimo: {MIN_DAYS_FOR_SHARPE})")
            
            # Recovery Factor
            recovery_factor: float = res_liquido / max_drawdown if max_drawdown > 1e-10 else 0.0
            
            # Z-Score
            z_score: float = self._calculate_z_score(returns)
            
            # Sequências
            max_wins_seq = self._max_consecutive(returns, True)
            max_losses_seq = self._max_consecutive(returns, False)

            self.metrics = {
                "--- GERAL ---": "",
                "Resultado Líquido": res_liquido,
                "Fator de Lucro": fator_lucro,
                "Assertividade (%)": assertividade,
                "Total Operações": total_ops,
                "--- ESTATÍSTICAS AVANÇADAS ---": "",
                "Expectativa Matemática": expectancy,
                "Índice Sharpe": sharpe,
                "Fator de Recuperação": recovery_factor,
                "Z-Score (Sequenciamento)": z_score,
                "Desvio Padrão (Retornos)": returns.std(),
                "--- SEQUÊNCIAS ---": "",
                "Máx Vitórias Seguidas": max_wins_seq,
                "Máx Derrotas Seguidas": max_losses_seq,
                "--- EXTREMOS ---": "",
                "Maior Lucro": wins.max() if not wins.empty else 0.0,
                "Maior Prejuízo": losses.min() if not losses.empty else 0.0,
                "Máx Drawdown": max_drawdown
            }
            
            # Armazena em cache
            self._metrics_cache[df_hash] = self.metrics
            logger.info("Métricas calculadas e armazenadas em cache")
            
            return self.metrics
            
        except Exception as e:
            logger.error(f"Erro ao calcular métricas: {e}", exc_info=True)
            self.metrics = self._get_empty_metrics()
            return self.metrics

    def _calculate_z_score(self, data: pd.Series) -> float:
        """
        Calcula Z-Score para teste de sequenciamento aleatório.
        :param data: Série com os retornos.
        :return: Z-Score ou np.nan se não aplicável.
        """
        if len(data) < 2:
            return np.nan
        
        try:
            wins_bin: np.ndarray = (data > 0).astype(int).values
            n: int = len(wins_bin)
            n_wins_seq: int = int(wins_bin.sum())
            n_losses_seq: int = n - n_wins_seq
            
            # Teste não aplicável quando todas são wins ou losses
            if n_wins_seq == 0 or n_losses_seq == 0:
                logger.debug("Z-Score não aplicável: apenas wins ou apenas losses")
                return np.nan
            
            num_runs: int = 1
            for i in range(1, n):
                if wins_bin[i] != wins_bin[i-1]:
                    num_runs += 1
            
            expected_runs: float = ((2 * n_wins_seq * n_losses_seq) / n) + 1
            
            if n <= 1:
                return np.nan
            
            variance_runs: float = (
                (2 * n_wins_seq * n_losses_seq * (2 * n_wins_seq * n_losses_seq - n)) / 
                (n * n * (n - 1))
            )
            
            if variance_runs <= 1e-10:
                return np.nan
            
            std_runs: float = np.sqrt(variance_runs)
            z_score = (num_runs - expected_runs) / std_runs
            
            logger.debug(f"Z-Score calculado: {z_score:.2f}")
            return z_score
            
        except Exception as e:
            logger.warning(f"Erro ao calcular Z-Score: {e}")
            return np.nan

    def _max_consecutive(self, data: pd.Series, is_win_sequence: bool = True) -> int:
        """
        Calcula máximo de vitórias ou derrotas consecutivas.
        :param data: Série com os retornos.
        :param is_win_sequence: True para vitórias, False para derrotas.
        :return: Número máximo de sequências.
        """
        max_seq: int = 0
        current_seq: int = 0
        
        for val in data:
            is_win: bool = val > 0
            if is_win == is_win_sequence:
                current_seq += 1
                max_seq = max(max_seq, current_seq)
            else:
                current_seq = 0
        
        return max_seq

    def clear_cache(self) -> None:
        """Limpa o cache de métricas."""
        self._metrics_cache.clear()
        logger.info("Cache de métricas limpo")


class MT5App(ctk.CTk):
    """
    Interface Gráfica do Usuário (GUI) para o Analisador de Performance MT5.
    Implementa carregamento assíncrono e barra de progresso.
    """
    
    def __init__(self) -> None:
        super().__init__()
        
        # Configuração de estilo do Matplotlib
        self._configure_plot_style()

        self.title("M633 - Analisador de Performance Avançado v4.3")
        self.geometry("1400x900")
        
        logger.info("Inicializando aplicação MT5 Analyzer v4.3")
        
        # Carrega configurações salvas
        self.config_data = ConfigManager.load_config()
        saved_path = self.config_data.get("mt5_path", "")
        
        # Tenta detectar automaticamente se não houver caminho salvo
        if not saved_path:
            detected = ConfigManager.detect_mt5_installation()
            if detected:
                saved_path = detected

        # Inicializa data_manager sem conectar ainda
        self.data_manager = MT5DataManager(mt5_path=saved_path if saved_path else None)
        
        # Estado da aplicação
        self.all_deals_raw: pd.DataFrame = pd.DataFrame()
        self.filtered_deals: pd.DataFrame = pd.DataFrame()
        self._loading: bool = False
        
        # Matplotlib figure (será criada depois)
        self.fig = None
        self.axes = None
        self.canvas = None
        
        # Layout Principal
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._create_sidebar(saved_path)
        self._create_main_content()
        
        # Tenta conectar automaticamente se houver caminho configurado
        if saved_path:
            self.after(500, self._auto_connect)
        
        # Registra cleanup ao fechar
        self.protocol("WM_DELETE_WINDOW", self._on_closing)

    def _configure_plot_style(self) -> None:
        """Configura fontes e estilo global do Matplotlib."""
        # Tenta configurar fonte com suporte a emojis (Segoe UI Emoji no Windows)
        available_fonts = set(f.name for f in fm.fontManager.ttflist)
        preferred_fonts = ["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Arial"]
        
        selected_font = None
        for font in preferred_fonts:
            if font in available_fonts:
                selected_font = font
                break
        
        if selected_font:
            plt.rcParams['font.family'] = selected_font
            logger.info(f"Fonte matplotlib configurada para: {selected_font}")
        else:
            plt.rcParams['font.family'] = 'sans-serif'
            logger.warning("Nenhuma fonte ideal para emojis encontrada. Usando padrão.")
            
        # Configurações globais de estilo para Dark Mode
        plt.style.use("dark_background")
        plt.rcParams.update({
            "axes.facecolor": "#1a1a1a",
            "figure.facecolor": "#1a1a1a",
            "grid.color": "#505050",
            "grid.linestyle": "--",
            "grid.alpha": 0.4,
            "text.color": "white",
            "axes.labelcolor": "white",
            "xtick.color": "white",
            "ytick.color": "white",
            "font.size": 11,
            "axes.titlesize": 14,
            "axes.labelsize": 12,
            "legend.fontsize": 10,
            "xtick.labelsize": 10,
            "ytick.labelsize": 10
        })

    def _create_sidebar(self, initial_path: str) -> None:
        """Cria o painel lateral com filtros e configurações."""
        self.sidebar = ctk.CTkFrame(self, width=300, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        self.sidebar.grid_rowconfigure(3, weight=1)
        
        # Título
        self.logo_label = ctk.CTkLabel(
            self.sidebar, 
            text="M633 ANALYZER v4.3", 
            font=ctk.CTkFont(size=20, weight="bold")
        )
        self.logo_label.pack(pady=(20, 10))
        
        # Seção: Configuração MT5
        self._create_config_section(initial_path)
        
        # Seção: Período de Análise
        self._create_date_section()
        
        # Seção: Filtros Dinâmicos
        self._create_filters_section()
        
        # Botão Aplicar Filtros
        self.btn_apply = ctk.CTkButton(
            self.sidebar, 
            text="Aplicar Filtros", 
            command=self.apply_filters, 
            fg_color="green", 
            hover_color="darkgreen"
        )
        self.btn_apply.pack(fill="x", padx=20, pady=20)

    def _create_config_section(self, initial_path: str) -> None:
        """Cria seção de configuração do caminho do MT5."""
        config_frame = ctk.CTkFrame(self.sidebar)
        config_frame.pack(fill="x", padx=20, pady=10)
        
        ctk.CTkLabel(
            config_frame, 
            text="Configuração MT5", 
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(pady=(10, 5))
        
        # Status da conexão
        self.connection_status = ctk.CTkLabel(
            config_frame, 
            text="● Desconectado", 
            text_color="red",
            font=ctk.CTkFont(size=12)
        )
        self.connection_status.pack(pady=(0, 10))
        
        # Campo de caminho
        path_frame = ctk.CTkFrame(config_frame, fg_color="transparent")
        path_frame.pack(fill="x", padx=10, pady=5)
        
        self.path_entry = ctk.CTkEntry(
            path_frame, 
            placeholder_text="Caminho do terminal64.exe..."
        )
        self.path_entry.pack(side="left", fill="x", expand=True)
        if initial_path:
            self.path_entry.insert(0, initial_path)
        
        self.btn_browse = ctk.CTkButton(
            path_frame, 
            text="...", 
            width=30, 
            command=self._browse_mt5_path
        )
        self.btn_browse.pack(side="right", padx=(5, 0))
        
        # Botões de conexão
        btn_frame = ctk.CTkFrame(config_frame, fg_color="transparent")
        btn_frame.pack(fill="x", padx=10, pady=10)
        
        self.btn_connect = ctk.CTkButton(
            btn_frame, 
            text="Conectar", 
            command=self._connect_mt5,
            fg_color="#1f538d"
        )
        self.btn_connect.pack(side="left", fill="x", expand=True, padx=(0, 5))
        
        self.btn_save_config = ctk.CTkButton(
            btn_frame, 
            text="Salvar", 
            command=self._save_configuration,
            width=80
        )
        self.btn_save_config.pack(side="right")

    def _create_date_section(self) -> None:
        """Cria seção de seleção de período."""
        date_frame = ctk.CTkFrame(self.sidebar)
        date_frame.pack(fill="x", padx=20, pady=10)
        
        ctk.CTkLabel(
            date_frame, 
            text="Período de Análise", 
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(pady=10)
        
        ctk.CTkLabel(date_frame, text="Data Início:", anchor="w").pack(fill="x", padx=10)
        self.date_from = ctk.CTkEntry(date_frame, placeholder_text="DD/MM/AAAA")
        self.date_from.insert(0, (datetime.now() - timedelta(days=365)).strftime("%d/%m/%Y"))
        self.date_from.pack(fill="x", padx=10, pady=5)
        
        ctk.CTkLabel(date_frame, text="Data Fim:", anchor="w").pack(fill="x", padx=10)
        self.date_to = ctk.CTkEntry(date_frame, placeholder_text="DD/MM/AAAA")
        self.date_to.insert(0, datetime.now().strftime("%d/%m/%Y"))
        self.date_to.pack(fill="x", padx=10, pady=5)
        
        self.btn_load = ctk.CTkButton(
            date_frame, 
            text="Carregar Dados MT5", 
            command=self.load_mt5_data
        )
        self.btn_load.pack(fill="x", padx=10, pady=15)
        
        # Barra de progresso (inicialmente oculta)
        self.progress_bar = ctk.CTkProgressBar(date_frame)
        self.progress_bar.set(0)
        
        self.progress_label = ctk.CTkLabel(
            date_frame, 
            text="", 
            font=ctk.CTkFont(size=10)
        )

    def _create_filters_section(self) -> None:
        """Cria seção de filtros dinâmicos."""
        filters_frame = ctk.CTkFrame(self.sidebar)
        filters_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        # Filtro de Ativos
        ctk.CTkLabel(
            filters_frame, 
            text="Ativos", 
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(anchor="w", padx=10, pady=(10, 0))
        
        self.asset_frame = ctk.CTkScrollableFrame(filters_frame, height=120)
        self.asset_frame.pack(fill="x", padx=10, pady=5)
        self.asset_vars: Dict[str, ctk.BooleanVar] = {}
        
        # Filtro de EAs
        ctk.CTkLabel(
            filters_frame, 
            text="EAs / Estratégias", 
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(anchor="w", padx=10, pady=(10, 0))
        
        self.ea_frame = ctk.CTkScrollableFrame(filters_frame, height=150)
        self.ea_frame.pack(fill="x", padx=10, pady=5)
        self.ea_vars: Dict[str, ctk.BooleanVar] = {}

    def _create_main_content(self) -> None:
        """Cria o conteúdo principal com KPIs e gráficos."""
        self.main_frame = ctk.CTkFrame(self)
        self.main_frame.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)
        
        # KPIs
        self.kpi_frame = ctk.CTkFrame(self.main_frame, height=100)
        self.kpi_frame.pack(fill="x", padx=10, pady=10)
        
        self.kpi_profit = self._create_kpi_card(self.kpi_frame, "Resultado Líquido", "R$ 0,00", 0)
        self.kpi_pf = self._create_kpi_card(self.kpi_frame, "Fator de Lucro", "0.00", 1)
        self.kpi_sharpe = self._create_kpi_card(self.kpi_frame, "Sharpe Ratio", "N/A", 2)
        self.kpi_winrate = self._create_kpi_card(self.kpi_frame, "Assertividade", "0%", 3)

        # Gráficos
        self.chart_frame = ctk.CTkFrame(self.main_frame)
        self.chart_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Cria figura matplotlib com 6 gráficos (3x2)
        self._create_matplotlib_figure()

    def _create_matplotlib_figure(self) -> None:
        """Cria a figura matplotlib para os gráficos."""
        if self.fig is not None:
            plt.close(self.fig)
        
        # Layout 3x2 para 6 gráficos com layout restrito para melhor espaçamento
        self.fig, self.axes = plt.subplots(3, 2, figsize=(14, 11), constrained_layout=True)
        # plt.style.use("dark_background") # Já configurado em _configure_plot_style
        
        # Cor de fundo da figura para combinar com o app
        self.fig.patch.set_facecolor('#1a1a1a')
        
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.chart_frame)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        
        logger.debug("Figura matplotlib criada com layout 3x2 e constrained_layout")

    def _create_kpi_card(self, master: ctk.CTkFrame, label: str, value: str, col: int) -> ctk.CTkLabel:
        """Cria um card de KPI."""
        card = ctk.CTkFrame(master)
        card.grid(row=0, column=col, padx=10, pady=10, sticky="nsew")
        master.grid_columnconfigure(col, weight=1)
        
        ctk.CTkLabel(card, text=label, font=ctk.CTkFont(size=12)).pack(pady=(10, 0))
        val_label = ctk.CTkLabel(card, text=value, font=ctk.CTkFont(size=20, weight="bold"))
        val_label.pack(pady=(0, 10))
        return val_label

    def _browse_mt5_path(self) -> None:
        """Abre diálogo para seleção do executável MT5."""
        initial_dir = os.path.dirname(self.path_entry.get()) if self.path_entry.get() else "C:\\Program Files"
        
        filename = filedialog.askopenfilename(
            title="Selecione o MetaTrader 5",
            filetypes=[("Executável MT5", "terminal64.exe;terminal.exe"), ("Todos os arquivos", "*.*")],
            initialdir=initial_dir
        )
        
        if filename:
            if ConfigManager.validate_mt5_path(filename):
                self.path_entry.delete(0, "end")
                self.path_entry.insert(0, filename)
                logger.info(f"Caminho MT5 selecionado: {filename}")
            else:
                messagebox.showerror(
                    "Arquivo Inválido",
                    "O arquivo selecionado não é um executável válido do MetaTrader 5.\n\n"
                    "Selecione terminal64.exe ou terminal.exe"
                )

    def _connect_mt5(self) -> None:
        """Estabelece conexão com MT5 usando o caminho configurado."""
        path = self.path_entry.get().strip()
        
        # Valida caminho antes de tentar conectar
        if path and not ConfigManager.validate_mt5_path(path):
            messagebox.showerror(
                "Caminho Inválido",
                "O caminho especificado não é um executável válido do MT5.\n\n"
                "Certifique-se de que o arquivo seja terminal64.exe ou terminal.exe"
            )
            return
        
        # Atualiza o caminho no data_manager
        self.data_manager.mt5_path = path if path else None
        
        logger.info(f"Tentando conectar ao MT5 com path: {path or 'padrão'}")
        
        if self.data_manager.connect():
            self._update_connection_status(True)
            messagebox.showinfo("Sucesso", "Conectado ao MetaTrader 5 com sucesso!")
        else:
            self._update_connection_status(False)
            error_code, error_desc = mt5.last_error()
            
            error_message = (
                f"Não foi possível conectar ao MT5.\n\n"
                f"Código: {error_code}\n"
                f"Descrição: {error_desc}\n\n"
                f"Sugestões:\n"
                f"• Verifique se o MT5 está instalado corretamente\n"
                f"• Certifique-se de que o caminho está correto\n"
                f"• Tente deixar o campo em branco para auto-detecção\n"
                f"• Verifique se você tem permissões necessárias"
            )
            
            messagebox.showerror("Erro de Conexão", error_message)

    def _auto_connect(self) -> None:
        """Tenta conectar automaticamente na inicialização."""
        logger.info("Tentando conexão automática ao MT5")
        if self.data_manager.connect():
            self._update_connection_status(True)
            logger.info("Conexão automática bem-sucedida")
        else:
            self._update_connection_status(False)
            logger.warning("Conexão automática falhou")

    def _update_connection_status(self, connected: bool) -> None:
        """Atualiza o indicador visual de status da conexão."""
        if connected:
            self.connection_status.configure(text="● Conectado", text_color="#00ff88")
        else:
            self.connection_status.configure(text="● Desconectado", text_color="red")

    def _save_configuration(self) -> None:
        """Salva a configuração atual em arquivo JSON."""
        path = self.path_entry.get().strip()
        
        # Valida antes de salvar
        if path and not ConfigManager.validate_mt5_path(path):
            if not messagebox.askyesno(
                "Confirmar Salvamento",
                "O caminho especificado não parece ser um executável MT5 válido.\n\n"
                "Deseja salvar mesmo assim?"
            ):
                return
        
        config = {
            "version": CONFIG_VERSION,
            "mt5_path": path,
            "last_update": datetime.now().isoformat()
        }
        
        if ConfigManager.save_config(config):
            messagebox.showinfo("Sucesso", "Configuração salva com sucesso!")
        else:
            messagebox.showerror("Erro", "Não foi possível salvar a configuração.")

    def _show_loading(self, show: bool, message: str = "") -> None:
        """
        Exibe ou oculta indicador de carregamento.
        :param show: True para exibir, False para ocultar.
        :param message: Mensagem a ser exibida.
        """
        if show:
            self.progress_bar.pack(fill="x", padx=10, pady=(5, 0))
            self.progress_bar.start()
            self.progress_label.configure(text=message)
            self.progress_label.pack(padx=10, pady=(0, 5))
            self.btn_load.configure(state="disabled", text="Carregando...")
            self._loading = True
            logger.debug(f"Loading iniciado: {message}")
        else:
            self.progress_bar.stop()
            self.progress_bar.pack_forget()
            self.progress_label.pack_forget()
            self.btn_load.configure(state="normal", text="Carregar Dados MT5")
            self._loading = False
            logger.debug("Loading finalizado")

    def load_mt5_data(self) -> None:
        """Carrega dados do histórico do MT5 de forma assíncrona."""
        if self._loading:
            logger.warning("Carregamento já em andamento")
            return
        
        if not self.data_manager.is_connected:
            messagebox.showwarning(
                "Aviso", 
                "MT5 não está conectado.\n\nConfigure a conexão primeiro na seção 'Configuração MT5'."
            )
            return
        
        # Validação de datas
        try:
            d_from = datetime.strptime(self.date_from.get(), "%d/%m/%Y")
            d_to = datetime.strptime(self.date_to.get(), "%d/%m/%Y") + timedelta(days=1) - timedelta(seconds=1)
        except ValueError as e:
            logger.error(f"Erro ao parsear datas: {e}")
            messagebox.showerror(
                "Erro", 
                "Formato de data inválido!\n\nUse o formato DD/MM/AAAA\n\nExemplo: 01/01/2024"
            )
            return

        if d_from > d_to:
            messagebox.showerror(
                "Erro", 
                "A 'Data Início' não pode ser maior que a 'Data Fim'.\n\n"
                "Verifique as datas e tente novamente."
            )
            return
        
        days_diff = (d_to - d_from).days
        if days_diff > MAX_PERIOD_DAYS:
            if not messagebox.askyesno(
                "Confirmação", 
                f"O período selecionado é de {days_diff} dias ({days_diff // 365} anos).\n\n"
                f"Isso excede o limite recomendado de {MAX_PERIOD_DAYS // 365} anos.\n\n"
                f"Períodos muito longos podem demorar para carregar.\n\n"
                f"Deseja continuar?"
            ):
                return

        # Callback para quando o carregamento terminar
        def on_load_complete(deals: Optional[pd.DataFrame], error: Optional[Exception]) -> None:
            # Executa na thread principal
            self.after(0, lambda: self._handle_load_complete(deals, error))

        # Inicia carregamento assíncrono
        logger.info(f"Iniciando carregamento assíncrono de {d_from} a {d_to}")
        self._show_loading(True, f"Carregando dados de {d_from.strftime('%d/%m/%Y')} a {d_to.strftime('%d/%m/%Y')}...")
        self.data_manager.fetch_deals_async(d_from, d_to, on_load_complete)

    def _handle_load_complete(self, deals: Optional[pd.DataFrame], error: Optional[Exception]) -> None:
        """
        Manipula o resultado do carregamento assíncrono.
        :param deals: DataFrame com os deals ou None se houve erro.
        :param error: Exceção caso tenha ocorrido erro.
        """
        self._show_loading(False)
        
        if error is not None:
            logger.error(f"Erro no carregamento: {error}")
            messagebox.showerror(
                "Erro ao Carregar Dados",
                f"Ocorreu um erro ao carregar os dados do MT5:\n\n{str(error)}\n\n"
                f"Verifique a conexão e tente novamente."
            )
            return
        
        if deals is None or deals.empty:
            logger.warning("Nenhum dado retornado do MT5")
            messagebox.showinfo(
                "Aviso", 
                "Nenhum dado encontrado para este período.\n\n"
                "Verifique:\n"
                "• Se há operações fechadas no período selecionado\n"
                "• Se a conta está correta\n"
                "• Se o MT5 está sincronizado"
            )
            self._clear_filters()
            return

        self.all_deals_raw = deals
        logger.info(f"Carregamento concluído: {len(deals)} deals")
        self._populate_filters()
        self.apply_filters()
        
        messagebox.showinfo(
            "Sucesso",
            f"{len(deals)} operações carregadas com sucesso!\n\n"
            f"Use os filtros laterais para analisar dados específicos."
        )

    def _clear_filters(self) -> None:
        """Limpa os filtros e dashboard."""
        logger.debug("Limpando filtros")
        
        for widget in self.asset_frame.winfo_children():
            widget.destroy()
        self.asset_vars.clear()
        
        for widget in self.ea_frame.winfo_children():
            widget.destroy()
        self.ea_vars.clear()
        
        self.filtered_deals = pd.DataFrame()
        self.update_dashboard()

    def _populate_filters(self) -> None:
        """Preenche os filtros dinâmicos com dados dos deals."""
        logger.debug("Populando filtros")
        
        # Ativos
        for widget in self.asset_frame.winfo_children():
            widget.destroy()
        self.asset_vars.clear()
        
        assets = sorted(self.all_deals_raw["symbol"].unique())
        logger.info(f"Encontrados {len(assets)} ativos únicos")
        
        for asset in assets:
            var = ctk.BooleanVar(value=True)
            cb = ctk.CTkCheckBox(self.asset_frame, text=asset, variable=var)
            cb.pack(anchor="w", padx=10, pady=2)
            self.asset_vars[asset] = var

        # EAs
        for widget in self.ea_frame.winfo_children():
            widget.destroy()
        self.ea_vars.clear()
        
        eas = sorted(self.all_deals_raw["ea_id"].unique())
        logger.info(f"Encontrados {len(eas)} EAs únicos")
        
        for ea in eas:
            var = ctk.BooleanVar(value=True)
            cb = ctk.CTkCheckBox(self.ea_frame, text=ea, variable=var)
            cb.pack(anchor="w", padx=10, pady=2)
            self.ea_vars[ea] = var

    def apply_filters(self) -> None:
        """Aplica filtros selecionados e atualiza dashboard."""
        if self.all_deals_raw.empty:
            self.filtered_deals = pd.DataFrame()
            self.update_dashboard()
            return

        selected_assets = [a for a, v in self.asset_vars.items() if v.get()]
        selected_eas = [e for e, v in self.ea_vars.items() if v.get()]
        
        logger.info(f"Aplicando filtros: {len(selected_assets)} ativos, {len(selected_eas)} EAs")

        self.filtered_deals = self.all_deals_raw[
            (self.all_deals_raw["symbol"].isin(selected_assets)) & 
            (self.all_deals_raw["ea_id"].isin(selected_eas))
        ].copy()
        
        logger.info(f"Dados filtrados: {len(self.filtered_deals)} deals")
        self.update_dashboard()

    def update_dashboard(self) -> None:
        """
        Atualiza KPIs e 6 gráficos profissionais de análise de trading.
        """
        logger.debug("Atualizando dashboard v4.3")
        
        df = self.filtered_deals.copy()
        metrics = self.data_manager.calculate_metrics(df)

        # Atualizar KPIs
        self.kpi_profit.configure(text=f"R$ {metrics.get('Resultado Líquido', 0.0):,.2f}")
        
        pf_value = metrics.get("Fator de Lucro", 0.0)
        if isinstance(pf_value, float) and pf_value == float("inf"):
            display_pf = "∞"
        else:
            display_pf = f"{pf_value:.2f}"
        self.kpi_pf.configure(text=display_pf)
        
        sharpe_value = metrics.get("Índice Sharpe", np.nan)
        if np.isnan(sharpe_value):
            display_sharpe = "N/A"
        else:
            display_sharpe = f"{sharpe_value:.2f}"
        self.kpi_sharpe.configure(text=display_sharpe)
        
        self.kpi_winrate.configure(text=f"{metrics.get('Assertividade (%)', 0.0):.1f}%")

        # Atualizar Gráficos
        if self.fig is None:
            return
            
        # Limpa eixos
        for ax in self.axes.flatten():
            ax.clear()
            
        if df.empty:
            for ax in self.axes.flatten():
                ax.text(0.5, 0.5, "Sem dados para exibir", 
                       ha='center', va='center', transform=ax.transAxes, color='gray')
                ax.set_xticks([])
                ax.set_yticks([])
            self.canvas.draw_idle()
            return

        try:
            # Cores
            COLOR_WIN = '#00E676'
            COLOR_LOSS = '#FF1744'
            COLOR_NEUTRAL = '#B0BEC5'
            COLOR_LINE = '#29B6F6'
            
            # ========================================
            # GRÁFICO 1: EVOLUÇÃO PATRIMONIAL
            # ========================================
            ax1 = self.axes[0, 0]
            df["cum_profit"] = df["net_profit"].cumsum()
            
            ax1.plot(range(len(df)), df["cum_profit"], color=COLOR_LINE, linewidth=2, label='Saldo Acumulado')
            ax1.fill_between(range(len(df)), df["cum_profit"], 0, alpha=0.1, color=COLOR_LINE)
            
            # Linha de tendência
            z = np.polyfit(range(len(df)), df["cum_profit"], 1)
            p = np.poly1d(z)
            ax1.plot(range(len(df)), p(range(len(df))), "w--", alpha=0.3, linewidth=1, label='Tendência')
            
            ax1.set_title("EVOLUÇÃO DO PATRIMÔNIO (CURVA DE CAPITAL)", fontweight='bold', pad=10)
            ax1.set_xlabel("Trades")
            ax1.set_ylabel("Saldo (R$)")
            ax1.grid(True)
            ax1.legend(loc='upper left', frameon=False)
            ax1.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'R$ {x:,.0f}'))
            
            # ========================================
            # GRÁFICO 2: PERFORMANCE DIÁRIA
            # ========================================
            ax2 = self.axes[0, 1]
            daily_profit = df.groupby(df["time"].dt.date)["net_profit"].sum().reset_index()
            daily_profit.columns = ["date", "profit"]
            
            colors = [COLOR_WIN if p > 0 else COLOR_LOSS for p in daily_profit["profit"]]
            ax2.bar(range(len(daily_profit)), daily_profit["profit"], color=colors, alpha=0.8)
            
            # Média Móvel
            if len(daily_profit) >= 7:
                ma7 = daily_profit["profit"].rolling(window=7, min_periods=1).mean()
                ax2.plot(range(len(daily_profit)), ma7, color='white', linewidth=1.5, 
                        label='Média (7 dias)', linestyle='--')
                ax2.legend(loc='upper left', frameon=False)
            
            ax2.axhline(y=0, color='white', linestyle='-', alpha=0.3, linewidth=1)
            ax2.set_title("RESULTADO DIÁRIO (LUCRO/PREJUÍZO)", fontweight='bold', pad=10)
            ax2.set_xlabel("Dias")
            ax2.set_ylabel("Resultado (R$)")
            ax2.grid(True, axis='y')
            ax2.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'R$ {x:,.0f}'))
            
            # ========================================
            # GRÁFICO 3: DISTRIBUIÇÃO POR PERÍODO
            # ========================================
            ax3 = self.axes[1, 0]
            df["hour"] = df["time"].dt.hour
            
            def categorize_period(hour):
                if 6 <= hour < 12: return "Manhã\n(06-12h)"
                elif 12 <= hour < 18: return "Tarde\n(12-18h)"
                else: return "Noite\n(18-06h)"
            
            df["period"] = df["hour"].apply(categorize_period)
            period_profit = df.groupby("period")["net_profit"].sum()
            period_count = df.groupby("period").size()
            
            colors_period = [COLOR_WIN if p > 0 else COLOR_LOSS for p in period_profit.values]
            bars = ax3.bar(period_profit.index, period_profit.values, color=colors_period, alpha=0.8)
            
            for bar, count in zip(bars, period_count):
                height = bar.get_height()
                offset = 5 if height >= 0 else -15
                ax3.text(bar.get_x() + bar.get_width()/2., height + offset,
                        f'R$ {height:,.0f}\n({count})',
                        ha='center', va='bottom' if height > 0 else 'top', 
                        fontsize=10, color='white')
            
            ax3.axhline(y=0, color='white', linestyle='-', alpha=0.3, linewidth=1)
            ax3.set_title("PERFORMANCE POR HORÁRIO", fontweight='bold', pad=10)
            ax3.set_ylabel("Resultado (R$)")
            ax3.grid(True, axis='y')
            ax3.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'R$ {x:,.0f}'))
            
            # ========================================
            # GRÁFICO 4: ESTATÍSTICAS (PIZZA)
            # ========================================
            ax4 = self.axes[1, 1]
            
            wins = len(df[df["net_profit"] > 0])
            losses = len(df[df["net_profit"] < 0])
            breakeven = len(df[df["net_profit"] == 0])
            total = len(df)
            
            if total > 0:
                sizes = [wins, losses, breakeven]
                labels = [f'Wins\n{wins}', f'Losses\n{losses}', f'Empates\n{breakeven}']
                colors_pie = [COLOR_WIN, COLOR_LOSS, COLOR_NEUTRAL]
                explode = (0.05, 0.05, 0)
                
                wedges, texts, autotexts = ax4.pie(sizes, labels=labels, colors=colors_pie, 
                                                    autopct='%1.1f%%', startangle=90, explode=explode,
                                                    textprops={'fontsize': 11, 'color': 'white'},
                                                    pctdistance=0.75)
                
                # Círculo central para transformar em gráfico de rosca (Donut)
                centre_circle = plt.Circle((0,0), 0.55, fc='#1a1a1a')
                ax4.add_artist(centre_circle)
                
                ax4.text(0, 0, f'Total\n{total}', ha='center', va='center', fontsize=14, fontweight='bold', color='white')
            
            ax4.set_title("DISTRIBUIÇÃO DE RESULTADOS", fontweight='bold', pad=10)
            
            # ========================================
            # GRÁFICO 5: TOP 10 TRADES
            # ========================================
            ax5 = self.axes[2, 0]
            
            top_10 = df.nlargest(10, "net_profit")["net_profit"]
            bottom_10 = df.nsmallest(10, "net_profit")["net_profit"]
            
            combined = pd.concat([bottom_10, top_10]).sort_values()
            colors_trades = [COLOR_LOSS if x < 0 else COLOR_WIN for x in combined.values]
            
            bars = ax5.barh(range(len(combined)), combined.values, color=colors_trades, alpha=0.8)
            
            for bar, val in zip(bars, combined.values):
                width = bar.get_width()
                label_x_pos = width + (5 if width > 0 else -5)
                ha = 'left' if width > 0 else 'right'
                ax5.text(label_x_pos, bar.get_y() + bar.get_height()/2.,
                        f'R$ {val:,.0f}', ha=ha, va='center', fontsize=9, color='white')
            
            ax5.axvline(x=0, color='white', linestyle='-', alpha=0.3, linewidth=1)
            ax5.set_title("TOP 10 MAIORES LUCROS E PREJUÍZOS", fontweight='bold', pad=10)
            ax5.set_xlabel("R$")
            ax5.set_yticks([])
            ax5.grid(True, axis='x')
            
            # ========================================
            # GRÁFICO 6: DRAWDOWN
            # ========================================
            ax6 = self.axes[2, 1]
            
            cum_max = df["cum_profit"].cummax()
            drawdown = cum_max - df["cum_profit"]
            
            ax6.fill_between(df.index, drawdown, color=COLOR_LOSS, alpha=0.3)
            ax6.plot(df.index, drawdown, color=COLOR_LOSS, linewidth=1.5)
            
            max_dd = metrics.get("Máx Drawdown", 0)
            if max_dd > 0:
                ax6.axhline(y=max_dd, color='white', linestyle='--', linewidth=1, 
                           label=f'Máx: R$ {max_dd:,.0f}')
                ax6.legend(loc='upper right', frameon=False)
            
            ax6.set_title("DRAWDOWN (REBAIXAMENTO)", fontweight='bold', pad=10)
            ax6.set_xlabel("Trades")
            ax6.set_ylabel("Valor (R$)")
            ax6.grid(True)
            ax6.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'R$ {x:,.0f}'))
            ax6.invert_yaxis()
            
            # Não usamos tight_layout aqui pois usamos constrained_layout na criação da figura
            self.canvas.draw_idle()
            
            logger.debug("Gráficos atualizados com sucesso")
            
        except Exception as e:
            logger.error(f"Erro ao atualizar gráficos: {e}", exc_info=True)
            for ax in self.axes.flatten():
                ax.clear()
                ax.text(0.5, 0.5, f"Erro: {str(e)}", 
                       ha='center', va='center', transform=ax.transAxes, color='red')
            self.canvas.draw_idle()

    def _on_closing(self) -> None:
        """Chamado ao fechar a janela principal."""
        logger.info("Encerrando aplicação")
        
        # Limpa matplotlib
        if self.fig is not None:
            plt.close(self.fig)
        
        # Encerra MT5
        self.data_manager.shutdown()
        
        # Fecha janela
        self.destroy()


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("M633 MT5 Analyzer v4.3 - Iniciando")
    logger.info("=" * 60)
    
    try:
        app = MT5App()
        app.mainloop()
    except Exception as e:
        logger.critical(f"Erro crítico na aplicação: {e}", exc_info=True)
        messagebox.showerror(
            "Erro Crítico",
            f"A aplicação encontrou um erro crítico:\n\n{str(e)}\n\n"
            f"Verifique o arquivo mt5_analyzer.log para mais detalhes."
        )
    finally:
        logger.info("Aplicação encerrada")
        logging.shutdown()