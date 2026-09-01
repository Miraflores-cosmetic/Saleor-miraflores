/** Datetime for admin tables / cards (ru-RU). */
export function formatAdminDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatAdminMoney(rubles: number): string {
  return `${rubles.toLocaleString('ru-RU')} ₽`;
}
