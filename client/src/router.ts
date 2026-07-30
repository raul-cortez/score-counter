import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from './stores/session.js'

const routes = [
  { path: '/hello', name: 'hello', component: () => import('./views/HelloView.vue') },
  { path: '/', name: 'lobby', component: () => import('./views/LobbyView.vue') },
  { path: '/room/:code', name: 'room', component: () => import('./views/RoomView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({ history: createWebHistory(), routes })

/**
 * Незнакомца отправляем представиться, но помним, куда он шёл.
 *
 * Это нужно ссылке-приглашению: друг открывает /room/ABC234, не имея аккаунта,
 * вводит ник и попадает именно в ту комнату, а не в лобби.
 */
router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.restored) await session.restore()

  if (session.user === null && to.name !== 'hello') {
    return { name: 'hello', query: { next: to.fullPath } }
  }
  if (session.user !== null && to.name === 'hello') {
    return { name: 'lobby' }
  }
  return true
})
