
export const formatCurrency = (value: number, symbol?: string) => {
  // Check if symbol suggests B3 (Brazilian Stock Exchange)
  // Heuristics: 
  // - Starts with WIN, WDO, IND, DOL (Futures)
  // - Ends with a number (Stocks like PETR4, VALE3) - standard ticker format is 4 letters + number
  // - Or explicit BRL context
  
  let locale = 'en-US';
  let currency = 'USD';

  // If no symbol provided, or symbol looks like B3, or explicitly BRL
  if (!symbol || 
      symbol === 'BRL' ||
      /^(WIN|WDO|IND|DOL)/.test(symbol) || 
      /^[A-Z]{4}\d{1,2}$/.test(symbol)
  ) {
    locale = 'pt-BR';
    currency = 'BRL';
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const formatNumber = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
};
