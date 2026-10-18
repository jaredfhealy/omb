const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function buildApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path
}

async function parseApiError(response) {
  try {
    const body = await response.json()
    return body?.error || `Request failed with status ${response.status}`
  } catch {
    return `Request failed with status ${response.status}`
  }
}

export async function loadState() {
  const response = await fetch(buildApiUrl('/api/state'))
  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  const data = await response.json()
  return data.state
}

export async function saveState(state) {
  const response = await fetch(buildApiUrl('/api/state'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(state)
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.json()
}
