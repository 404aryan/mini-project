/**
 * Fetches a resource and reads its body under one deadline, so a download that
 * stalls fails with `timeoutMessage` instead of leaving recognition loading forever.
 */
export async function fetchWithDeadline<T>(url: string, read: (response: Response) => Promise<T>, timeoutMessage: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await read(await fetch(url, { cache: 'no-store', signal: controller.signal }))
  } catch (error) {
    throw controller.signal.aborted ? new Error(timeoutMessage) : error
  } finally {
    clearTimeout(timer)
  }
}
