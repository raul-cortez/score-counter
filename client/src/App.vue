<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme.js'
import { useSessionStore } from './stores/session.js'
import ThemeToggle from './components/ThemeToggle.vue'
import NicknameEditor from './components/NicknameEditor.vue'

const { restoreTheme } = useTheme()
const session = useSessionStore()

onMounted(restoreTheme)
</script>

<template>
  <div class="app-root">
    <!--
      Шапка стоит в потоке, а не поверх него: висящая кнопка накрывала то заголовок
      экрана, то верхнее уведомление, и добраться до перекрытого можно было только
      прокруткой. Своя строка ничего не закрывает.
    -->
    <header class="top-bar">
      <!--
        Имя стоит здесь, а не на экранах: оно одно на всё приложение, и в лобби с
        комнатой показывалось дважды, каждый раз со своей подводкой. В строке с
        кнопками ему хватает самого себя.
      -->
      <NicknameEditor v-if="session.user" class="who" />
      <span class="spacer" />
      <ThemeToggle />
      <!--
        Сюда экран кладёт своё главное действие — например, выход из комнаты.
        Через телепорт, а не пропсами: шапка живёт выше маршрутизатора и о том,
        что происходит внутри экрана, знать не должна.
      -->
      <div id="top-actions" class="actions" />
    </header>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped lang="scss">
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  /* Фон непрозрачный: контент проезжает под шапкой при прокрутке. */
  background: var(--bg);
}

/* Имя слева, кнопки справа — и так на любой ширине. */
.spacer {
  flex: 1;
}

.who {
  min-width: 0;
  color: var(--text-muted);
  font-size: 15px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;

  /* Пустой слот не должен оставлять зазор рядом с переключателем. */
  &:empty {
    display: none;
  }
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 20px 20px;
}
</style>
