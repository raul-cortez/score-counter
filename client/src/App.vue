<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme.js'
import ThemeToggle from './components/ThemeToggle.vue'

const { restoreTheme } = useTheme()

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
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  /* Фон непрозрачный: контент проезжает под шапкой при прокрутке. */
  background: var(--bg);
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
