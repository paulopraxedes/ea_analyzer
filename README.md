# EA Analyzer Web

Plataforma web para análise de performance de operações do MetaTrader 5. O projeto é dividido em um backend FastAPI que consulta dados do MT5 e um frontend React que apresenta dashboards e filtros avançados.

## Visão Geral

- Backend em FastAPI com endpoints para status, conexão e dados
- Frontend em React/Vite com KPIs, gráficos, heatmap e painel do melhor EA
- Filtros por período, ativo, EA, dia da semana e horário
- Atualização automática configurável por resync em minutos

## Estrutura do Projeto

```
ea_analyzer/
├── backend/          API FastAPI
├── frontend/         Dashboard React/Vite
├── analyzer.py       Aplicação desktop legada
└── README_REFACTOR.md
```

## Pré-requisitos

- Python 3.10+
- Node.js 18+
- MetaTrader 5 instalado e disponível no mesmo host do backend

## Configuração

Crie um arquivo `backend/.env` com as configurações do MT5:

```
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MIN_DAYS_FOR_SHARPE=30
```

Se `MT5_PATH` não for definido, o backend tentará usar a configuração padrão do MT5.

## Como Rodar

### Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```
cd frontend
npm install
npm run dev
```

Abra o navegador em `http://localhost:5173` e clique em Conectar para iniciar a leitura dos dados do MT5.

## Uso Rápido

1. Configure o período no painel de filtros
2. Selecione ativos e EAs
3. Ajuste os filtros de dias e horários
4. Defina o resync em minutos para atualização automática
5. Navegue pelas abas para visualizar KPIs, gráficos, heatmap e últimos trades

## Endpoints da API

Base URL: `http://127.0.0.1:8000/api/v1`

### Status da Conexão

```
curl http://127.0.0.1:8000/api/v1/status
```

### Conectar ao MT5

```
curl -X POST http://127.0.0.1:8000/api/v1/connect
```

### Buscar Deals

```
curl -X POST http://127.0.0.1:8000/api/v1/deals \
  -H "Content-Type: application/json" \
  -d "{\"date_from\":\"2025-01-01T00:00:00\",\"date_to\":\"2025-01-31T23:59:59\"}"
```

### Métricas

```
curl -X POST http://127.0.0.1:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d "{\"date_from\":\"2025-01-01T00:00:00\",\"date_to\":\"2025-01-31T23:59:59\"}"
```

## Scripts Úteis (Frontend)

```
npm run dev
npm run build
npm run lint
```

## Solução de Problemas

- MT5 desconectado: verifique o caminho do terminal em `backend/.env` e se o MT5 está aberto
- Falha na API: confirme se o backend está rodando em `http://127.0.0.1:8000`
- Tela em branco: verifique se o frontend está rodando em `http://localhost:5173`

## Contribuição

Diretrizes em [CONTRIBUTING.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CONTRIBUTING.md).

## Código de Conduta

Regras em [CODE_OF_CONDUCT.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CODE_OF_CONDUCT.md).

## Changelog

Histórico de mudanças em [CHANGELOG.md](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/CHANGELOG.md).

## Licença

Este projeto é licenciado sob os termos descritos em [LICENSE](file:///c:/Users/Paulo/OneDrive/Documentos/Sistemas%20Python/LLM/claude/ea_analyzer/LICENSE).
