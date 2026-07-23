const BASE = '/api/v1'

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
        )
    }
    const text = await res.text()
    if (!text) return undefined as T
    try {
        return JSON.parse(text)
    } catch {
        return undefined as T
    }
}
