/**
 * Кому переходит роль хоста, когда прежний пропал.
 *
 * Порядок участников — тот же, что задаёт места за столом, поэтому роль достаётся
 * предсказуемому человеку, а не случайному. Онлайн-список приходит из реестра
 * соединений и может содержать тех, кто уже вышел из комнаты, — отсюда пересечение
 * с составом, а не доверие списку целиком.
 *
 * null означает «передавать некому»: прежний хост остаётся на месте.
 */
export function nextHost(
  memberIds: string[],
  onlineUserIds: string[],
  currentHostId: string,
): string | null {
  const online = new Set(onlineUserIds)

  return memberIds.find((id) => id !== currentHostId && online.has(id)) ?? null
}
