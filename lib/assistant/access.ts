/** Помощник доступен, только если флаг smart_coach включён у человека и он не выключил помощника в /settings. */
export function assistantAvailable(flagOn: boolean, enabled: boolean): boolean {
  return flagOn && enabled;
}
