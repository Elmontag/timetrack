import { useCallback, useState } from 'react'

type AsyncFn<TArgs extends any[], TResult> = (...args: TArgs) => Promise<TResult>

export function useAsync<TArgs extends any[], TResult>(fn: AsyncFn<TArgs, TResult>) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const run = useCallback(
    async (...args: TArgs) => {
      setLoading(true)
      setError(null)
      try {
        const result = await fn(...args)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [fn],
  )

  return { run, loading, error }
}
