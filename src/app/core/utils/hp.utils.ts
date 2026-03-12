import { Pokemon } from '../models/pokemon.model';

/**
 * HP-related calculation utilities.
 */

/**
 * Calculates the max HP for a Pokémon using the simplified formula:
 * baseStat * 2 + 110.
 */
export function calculateMaxHp(pokemon: Pokemon): number {
  const hpStat = pokemon.stats.find(s => s.stat.name === 'hp');
  return (hpStat?.base_stat ?? 0) * 2 + 110;
}

/**
 * Returns the HP percentage (0–100) given current and max HP.
 */
export function getHpPercentage(currentHp: number, maxHp: number): number {
  if (maxHp === 0) return 0;
  return Math.round((currentHp / maxHp) * 100);
}

/**
 * Returns a CSS class name based on the HP percentage.
 */
export function getHpBarColorClass(percentage: number): string {
  if (percentage <= 20) return 'critical';
  if (percentage <= 50) return 'warning';
  return 'healthy';
}
