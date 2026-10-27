const PREFIX = 'ghostwolf:host-recovery:'

export function storeHostRecoveryKey(roomId: string, key: string) {
  try {
    localStorage.setItem(PREFIX + roomId, key)
  } catch {
    // Private browsing or storage policies may block persistence; the UI still shows the key.
  }
}

export function getHostRecoveryKey(roomId: string) {
  try {
    return localStorage.getItem(PREFIX + roomId)
  } catch {
    return null
  }
}
