import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RoomState, RoomSummary } from '@score/shared'
import { api } from '../api.js'

export const useLobbyStore = defineStore('lobby', () => {
  const rooms = ref<RoomSummary[]>([])
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      rooms.value = await api.get<RoomSummary[]>('/rooms')
    } finally {
      loading.value = false
    }
  }

  /** Возвращает код: создатель сразу переходит в свою комнату. */
  async function create(name: string, password?: string): Promise<string> {
    const created = await api.post<RoomState>('/rooms', {
      name,
      ...(password ? { password } : {}),
    })
    return created.room.code
  }

  return { rooms, loading, load, create }
})
