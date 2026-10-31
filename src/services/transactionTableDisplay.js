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

function extractTicker(value) {
  const symbol = String(value || '').trim()
  if (!symbol) return ''
  const optionMatch = symbol.match(/^([\w.-]+)\s+\d{2}\/\d{2}\/\d{4}\s+[\d.]+\s+[CP]$/i)
  if (optionMatch) return optionMatch[1]
  return symbol
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
    symbol: extractTicker(row?.symbol || row?.ticker || ''),
    description: row?.description || '',
    quantity: row?.quantity ?? '',
    price,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    ror: row?.ror ?? '-'
  }
}
