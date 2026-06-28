import { useState, useEffect, useCallback } from 'react'
import { declarationAPI } from '../services/api.js'

export function useDeclarations(params = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await declarationAPI.list(params)
      setData(res.data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(params)])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

export function useStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    declarationAPI.stats()
      .then(r => setStats(r.data))
      .finally(() => setLoading(false))
  }, [])

  return { stats, loading }
}
