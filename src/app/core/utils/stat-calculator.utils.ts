import { Pokemon } from '../models/pokemon.model';

/**
 * Stat-related calculation utilities.
 */

/**
 * Returns the multiplier for a stat stage change (−6 to +6).
 * Used for Attack, Defense, Sp.Atk, Sp.Def, Speed.
 */
export function getStatStageModifier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  return clamped >= 0
    ? (2 + clamped) / 2
    : 2 / (2 - clamped);
}

/**
 * Returns the multiplier for Accuracy/Evasion stage changes (−6 to +6).
 */
export function getAccuracyEvasionModifier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  return clamped >= 0
    ? (3 + clamped) / 3
    : 3 / (3 - clamped);
}

/**
 * Returns the effective stat value after applying stage modifier.
 * HP uses a different formula: base * 2 + 110.
 * Other stats use: base * 2 + 5.
 */
export function getModifiedStat(baseStat: number, stage: number, isHp = false): number {
  const modifier = getStatStageModifier(stage);
  const effective = isHp ? baseStat * 2 + 110 : baseStat * 2 + 5;
  return Math.floor(effective * modifier);
}

/**
 * Calculates the effective speed of a Pokémon considering stat stages and paralysis.
 */
export function calculateEffectiveSpeed(
  pokemon: Pokemon,
  statChanges: Record<string, number>,
  status: string | null,
): number {
  const baseSpeed = pokemon.stats.find(s => s.stat.name === 'speed')?.base_stat ?? 50;
  const modifier = getStatStageModifier(statChanges['speed'] ?? 0);
  const paralysisModifier = status === 'paralysis' ? 0.5 : 1;
  return Math.floor((baseSpeed * 2 + 5) * modifier * paralysisModifier);
}

/**
 * Extracts a specific base stat from a Pokemon by name.
 */
export function getBaseStat(pokemon: Pokemon, statName: string, fallback = 50): number {
  return pokemon.stats.find(s => s.stat.name === statName)?.base_stat ?? fallback;
}

/**
 * Calculates the Base Stat Total (BST) for a Pokémon.
 */
export function calculateBst(pokemon: Pokemon): number {
  return pokemon.stats.reduce((total, stat) => total + stat.base_stat, 0);
}
