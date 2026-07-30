<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { Player } from '../types'

defineProps<{
  winner: Player
}>()

const emit = defineEmits<{
  newGame: []
}>()

type Particle = {
  id: number
  x: number
  y: number
  color: string
  size: number
  velocityX: number
  velocityY: number
}

const particles = ref<Particle[]>([])
let particleId = 0
let animationFrame: number
let intervalId: number
let audioContext: AudioContext | null = null

const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#1dd1a1']

const playFireworkSound = () => {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  const now = audioContext.currentTime
  const duration = 1.5

  // White noise for swoosh effect
  const bufferSize = audioContext.sampleRate * duration
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
  const output = noiseBuffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1
  }

  const whiteNoise = audioContext.createBufferSource()
  whiteNoise.buffer = noiseBuffer

  // Filter for swoosh texture
  const filter = audioContext.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1000 + Math.random() * 500, now)
  filter.frequency.exponentialRampToValueAtTime(200, now + duration)
  filter.Q.value = 1

  // Volume envelope - long fade out
  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(0.25, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + duration)

  whiteNoise.connect(filter)
  filter.connect(gain)
  gain.connect(audioContext.destination)

  whiteNoise.start(now)
  whiteNoise.stop(now + duration)

  // Sparkle layer
  const sparkle = audioContext.createOscillator()
  const sparkleGain = audioContext.createGain()
  sparkle.type = 'sine'
  sparkle.frequency.setValueAtTime(2000 + Math.random() * 1000, now)
  sparkle.frequency.exponentialRampToValueAtTime(500, now + duration * 0.8)
  sparkleGain.gain.setValueAtTime(0.08, now)
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8)
  sparkle.connect(sparkleGain)
  sparkleGain.connect(audioContext.destination)
  sparkle.start(now)
  sparkle.stop(now + duration)
}

const createFirework = (x: number, y: number) => {
  const count = 30
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count
    const velocity = 3 + Math.random() * 3
    particles.value.push({
      id: particleId++,
      x,
      y,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 4,
      velocityX: Math.cos(angle) * velocity,
      velocityY: Math.sin(angle) * velocity
    })
  }
  playFireworkSound()
}

const animate = () => {
  particles.value = particles.value
    .map(p => ({
      ...p,
      x: p.x + p.velocityX,
      y: p.y + p.velocityY,
      velocityY: p.velocityY + 0.1,
      size: p.size * 0.96
    }))
    .filter(p => p.size > 0.5)

  animationFrame = requestAnimationFrame(animate)
}

const launchRandomFirework = () => {
  const x = Math.random() * window.innerWidth
  const y = Math.random() * (window.innerHeight * 0.6)
  createFirework(x, y)
}

onMounted(() => {
  launchRandomFirework()
  launchRandomFirework()
  launchRandomFirework()

  intervalId = setInterval(launchRandomFirework, 800)
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  clearInterval(intervalId)
  audioContext?.close()
})
</script>

<template>
  <div class="victory-root">
    <div class="fireworks">
      <div
        v-for="p in particles"
        :key="p.id"
        class="particle"
        :style="{
          left: `${p.x}px`,
          top: `${p.y}px`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          background: p.color
        }"
      />
    </div>

    <div class="content">
      <h1 class="title">{{ winner.name }} победил!</h1>
      <p class="score">{{ winner.score }} очков</p>
      <button class="btn-new" @click="emit('newGame')">
        Новая игра
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.victory-root {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.fireworks {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.particle {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.content {
  text-align: center;
  z-index: 10;
}

.title {
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 16px;
  animation: bounce 0.6s ease-out;

  @media (min-width: 600px) {
    font-size: 48px;
  }
}

.score {
  font-size: 24px;
  color: var(--text-muted);
  margin: 0 0 32px;
}

.btn-new {
  padding: 16px 32px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--btn-hover);
  }
}

@keyframes bounce {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
