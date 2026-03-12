import { SelectedMove } from '../../../core/models/move.model';
import { Pokemon, MoveReference } from '../../../core/models/pokemon.model';
import { BattleLogEntry, StatChangeResult } from '../../../core/models/battle.model';
import { SELF_TARGETS, OPPONENT_TARGETS } from '../../../core/constants/status.constant';
import { getStatStageModifier, getAccuracyEvasionModifier } from '../../../core/utils/stat-calculator.utils';
import { pickRandomItems } from '../../../core/utils/array.utils';

/**
 * Pure functions for handling move-related logic in battle.
 */

/**
 * Determines whether a move targets the user ('self') or the opponent.
 */
export function getMoveTarget(move: SelectedMove): 'self' | 'opponent' {
  const targetName = move.target?.name ?? '';
  if (SELF_TARGETS.includes(targetName)) return 'self';
  return 'opponent'; // Default to opponent for safety
}

/**
 * Checks whether a move hits based on accuracy and evasion stages.
 */
export function checkMoveHits(
  move: SelectedMove,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
): boolean {
  // Moves without an accuracy value always hit (e.g., Swift)
  if (!move.accuracy || move.accuracy === null) return true;

  const accMultiplier = getAccuracyEvasionModifier(attackerAccuracyStage);
  const evaMultiplier = getAccuracyEvasionModifier(defenderEvasionStage);
  const finalAccuracy = (move.accuracy / 100) * (accMultiplier / evaMultiplier);

  return Math.random() < finalAccuracy;
}

/**
 * Processes stat changes from a move and returns the results to be applied.
 * Does not mutate any state — the caller applies the returned changes.
 */
export function processStatChanges(
  move: SelectedMove,
  attackerName: string,
  defenderName: string,
  attackerCurrentStages: Record<string, number>,
  defenderCurrentStages: Record<string, number>,
): StatChangeResult[] {
  if (!move.stat_changes || !Array.isArray(move.stat_changes) || move.stat_changes.length === 0) {
    return [];
  }

  // stat_chance = 0 means 100% (pure stat moves like Swords Dance)
  const statChance = move.meta?.stat_chance ?? 0;
  const chance = statChance === 0 ? 100 : statChance;
  if (Math.random() * 100 >= chance) return [];

  const metaCategory = move.meta?.category?.name ?? '';
  const moveTarget = getMoveTarget(move);
  const results: StatChangeResult[] = [];

  for (const change of move.stat_changes) {
    const statName = change.stat?.name;
    const changeAmount = change.change ?? 0;
    if (!statName || changeAmount === 0) continue;

    // Determine who receives the stat change based on meta.category:
    // - "damage+raise": modifies the USER's stats (e.g. Close Combat lowers own defenses)
    // - "damage+lower": modifies the TARGET's stats (e.g. Psychic lowers sp.def)
    // - "net-good-stats": self-buffs, but check target (Captivate targets opponent)
    let appliesToAttacker: boolean;

    if (metaCategory === 'damage+raise') {
      appliesToAttacker = true;
    } else if (metaCategory === 'damage+lower') {
      appliesToAttacker = false;
    } else if (metaCategory === 'net-good-stats') {
      appliesToAttacker = moveTarget === 'self';
    } else {
      appliesToAttacker = moveTarget === 'self';
    }

    const currentStages = appliesToAttacker ? attackerCurrentStages : defenderCurrentStages;
    const currentStage = currentStages[statName] ?? 0;
    const newStage = Math.max(-6, Math.min(6, currentStage + changeAmount));

    const targetName = appliesToAttacker ? attackerName : defenderName;
    const changeText = changeAmount > 0 ? 'rose' : 'fell';
    const sharpText = Math.abs(changeAmount) > 1 ? ' sharply' : '';

    results.push({
      targetIsAttacker: appliesToAttacker,
      statName,
      newStage,
      log: {
        message: `${targetName}'s ${statName.replace('-', ' ')}${sharpText} ${changeText}!`,
        type: 'stat',
        timestamp: Date.now(),
      },
    });
  }

  return results;
}

/**
 * Selects `count` random moves from a Pokémon's move pool.
 */
export function selectRandomMoves(pokemon: Pokemon, count: number): MoveReference[] {
  const moves = (pokemon.moves ?? []).map(m => m.move);
  return pickRandomItems(moves, count);
}
