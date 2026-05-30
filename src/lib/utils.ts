export function cn(...classes: any[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatNumber(num: number): string {
  return num.toString();
}