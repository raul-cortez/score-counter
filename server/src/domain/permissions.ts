export type PermissionContext = {
  /** Кто выполняет действие. */
  actorId: string
  /** Текущий хост комнаты. */
  hostId: string
  /** Состав игры, зафиксированный на старте. */
  playerIds: string[]
}

/** Действовать может только участник состава: себе — всегда, другому — если он хост. */
function actorMayTouch(ctx: PermissionContext, targetUserId: string): boolean {
  if (!ctx.playerIds.includes(ctx.actorId)) return false
  if (!ctx.playerIds.includes(targetUserId)) return false
  return ctx.actorId === targetUserId || ctx.actorId === ctx.hostId
}

export function canAddEntryFor(ctx: PermissionContext, targetUserId: string): boolean {
  return actorMayTouch(ctx, targetUserId)
}

export function canVoidEntry(ctx: PermissionContext, entryOwnerId: string): boolean {
  return actorMayTouch(ctx, entryOwnerId)
}

export function canStartGame(ctx: PermissionContext): boolean {
  return ctx.actorId === ctx.hostId
}
