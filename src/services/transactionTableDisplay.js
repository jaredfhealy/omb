export function formatActionLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === '-') return '-'

  const explicit = {
    'sell to open': 'Sell to Open',
    'buy to open': 'Buy to Open',
    'sell to close': 'Sell to Close',
    'buy to close': 'Buy to Close',
    expired: 'Expired',
    assigned: 'Assigned',
    'sell short': 'Sell Short',
    'weekly expiration': 'Weekly Expiration',
    'single week trade': 'Single Week Trade',
    'ratio spread': 'Ratio Spread',
    'ratio opened': 'Ratio Opened',
    'ratio closed': 'Ratio Closed',
    'ratio rolled': 'Ratio Rolled',
    'new long put': 'New Long PUT',
    'new long call': 'New Long CALL',
    'new short put': 'New Short PUT',
    'new short call': 'New Short CALL',
    'income summary': 'Income Summary',
    'bank interest': 'Bank Interest',
    'credit interest': 'Credit Interest',
    dividend: 'Dividend',
    'cash dividend': 'Cash Dividend',
    'qualified dividend': 'Qualified Dividend',
    'reinvest dividend': 'Reinvest Dividend',
    'reinvest shares': 'Reinvest Shares',
    call: 'Call',
    put: 'Put'
  }

  if (explicit[normalized]) return explicit[normalized]
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const OPTION_SYMBOL_REGEX = /^([\w.-]+)\s+(\d{2}\/\d{2}\/\d{2,4})\s+([\d.]+)\s+([CP])$/i

export function extractUnderlyingSymbol(symbolValue, descriptionValue = '') {
  const symbol = String(symbolValue || '').trim().toUpperCase()
  const description = String(descriptionValue || '').trim()
  if (!symbol && !description) return ''
  const optionMatch = OPTION_SYMBOL_REGEX.exec(symbol) || OPTION_SYMBOL_REGEX.exec(description)
  if (optionMatch) return String(optionMatch[1] || '').toUpperCase()
  return symbol.includes(' ') ? symbol.split(/\s+/)[0] : symbol
}

export function getTradeTransactionAttributes(row) {
  const rawSymbol = String(row?.symbol || '').trim().toUpperCase()
  const description = String(row?.description || '').trim()
  const action = String(row?.action || row?.type || '').trim().toLowerCase()
  const match = OPTION_SYMBOL_REGEX.exec(rawSymbol) || OPTION_SYMBOL_REGEX.exec(description)

  const side = action.includes('sell') ? 'Sell' : (action.includes('buy') ? 'Buy' : 'Other')
  const optionType = match ? (String(match[4]).toUpperCase() === 'P' ? 'PUT' : 'CALL') : 'STOCK'
  const strike = match ? Number(match[3]) : null
  const exp = match ? String(match[2]) : null
  const qty = Math.abs(Number(row?.quantity || 0))
  const symbol = extractUnderlyingSymbol(rawSymbol, description)

  return { side, optionType, strike, exp, qty, symbol, isOption: Boolean(match) }
}

function formatRorValue(value) {
  if (value === '-' || value === '' || value === null || value === undefined) return '-'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return `${parsed.toFixed(2)}%`
}

export function createTransactionTableColumns(currency) {
  return [
    { key: 'date', label: 'Date', value: (row) => row.date || '' },
    { key: 'action', label: 'Action', value: (row) => formatActionLabel(row.action) },
    { key: 'symbol', label: 'Symbol', value: (row) => row.symbol || '' },
    { key: 'description', label: 'Description', value: (row) => row.description || '' },
    { key: 'quantity', label: 'Quantity', class: 'text-end', value: (row) => row.quantity ?? '' },
    {
      key: 'price',
      label: 'Price',
      class: 'text-end',
      value: (row) => (row.price !== undefined && row.price !== null && row.price !== '' ? currency(Number(row.price)) : '')
    },
    {
      key: 'amount',
      label: 'Amount',
      class: 'text-end',
      cellClass: (row) => (Number(row.amount || 0) < 0 ? 'text-danger' : ''),
      value: (row) => (row.amount !== undefined && row.amount !== null ? currency(Number(row.amount)) : '')
    },
    {
      key: 'ror',
      label: 'ROR',
      class: 'text-end',
      headerTooltip: 'ROR is calculated after Comm & Fees',
      value: (row) => formatRorValue(row.ror)
    }
  ]
}

export function toTransactionDisplayRow(row) {
  const amountValue = row?.amount ?? row?.premium ?? 0
  const parsedAmount = Number(amountValue)
  const strikeNumber = Number(row?.strike)
  const price = row?.price !== undefined && row?.price !== null
    ? row.price
    : (Number.isFinite(strikeNumber) ? strikeNumber : null)

  return {
    ...row,
    date: row?.date || '',
    action: row?.action || row?.type || row?.contractType || '',
    symbol: extractUnderlyingSymbol(row?.symbol || row?.ticker || '', row?.description || ''),
    description: row?.description || '',
    quantity: row?.quantity ?? '',
    price,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    ror: row?.ror ?? '-'
  }
}
