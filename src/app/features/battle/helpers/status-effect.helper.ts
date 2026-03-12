import { SelectedMove } from '../../../core/models/move.model';
import { BattleLogEntry, CanActResult, StatusApplicationResult } from '../../../core/models/battle.model';

/**
 * Pure functions for handling status effects during battle.
 * All functions return results without side effects — the component applies them.
 */

/**
 * Checks whether a Pokémon can act this turn given its current status.
 * Returns an object describing the outcome and any log messages.
 */
export function checkCanAct(params: {
  pokemonName: string;
  status: string | null;
  sleepTurns: number;
  confusionTurns: number;
  attackBaseStat: number;
  defenseBaseStat: number;
}): CanActResult {
  const { pokemonName, status, sleepTurns, confusionTurns, attackBaseStat, defenseBaseStat } = params;
  const logs: BattleLogEntry[] = [];
  let newSleepTurns = sleepTurns;
  let newConfusionTurns = confusionTurns;
  let statusCleared = false;

  // ─── Sleep ────────────────────────────────────────────────────────────
  if (status === 'sleep') {
    if (sleepTurns >= 3 || Math.random() < 0.25) {
      statusCleared = true;
      newSleepTurns = 0;
      logs.push(createLog(`${pokemonName} woke up!`, 'status'));
    } else {
      newSleepTurns = sleepTurns + 1;
      return { canAct: false, selfDamage: 0, logs, newSleepTurns, newConfusionTurns, statusCleared };
    }
  }

  // ─── Freeze ───────────────────────────────────────────────────────────
  if (status === 'freeze') {
    if (Math.random() < 0.2) {
      statusCleared = true;
      logs.push(createLog(`${pokemonName} thawed out!`, 'status'));
    } else {
      return { canAct: false, selfDamage: 0, logs, newSleepTurns, newConfusionTurns, statusCleared };
    }
  }

  // ─── Paralysis ────────────────────────────────────────────────────────
  if (status === 'paralysis') {
    if (Math.random() < 0.25) {
      logs.push(createLog(`${pokemonName} is paralyzed! It can't move!`, 'status'));
      return { canAct: false, selfDamage: 0, logs, newSleepTurns, newConfusionTurns, statusCleared };
    }
  }

  // ─── Confusion ────────────────────────────────────────────────────────
  if (confusionTurns > 0) {
    newConfusionTurns = confusionTurns - 1;
    if (newConfusionTurns === 0) {
      logs.push(createLog(`${pokemonName} snapped out of confusion!`, 'status'));
    }
    if (Math.random() < 0.33) {
      const selfDamage = Math.max(1, Math.floor(40 + attackBaseStat - defenseBaseStat));
      return { canAct: false, selfDamage, logs, newSleepTurns, newConfusionTurns, statusCleared };
    }
  }

  return { canAct: true, selfDamage: 0, logs, newSleepTurns, newConfusionTurns, statusCleared };
}

/**
 * Attempts to apply a status condition from a move.
 * Returns null if no status should be applied.
 */
export function tryApplyStatusCondition(
  move: SelectedMove,
  attackerName: string,
  defenderName: string,
  defenderCurrentStatus: string | null,
): StatusApplicationResult | null {
  const ailment = move.meta?.ailment?.name;
  const ailmentChance = move.meta?.ailment_chance ?? 0;

  if (!ailment || ailment === 'none') return null;

  // Chance: 0 means 100% for pure status moves
  const chance = ailmentChance === 0 ? 100 : ailmentChance;
  if (Math.random() * 100 > chance) return null;

  const logs: BattleLogEntry[] = [];

  // Special case: Rest puts the user to sleep
  if (ailment === 'sleep' && move.name?.toLowerCase() === 'rest') {
    logs.push(createLog(`${attackerName} fell asleep!`, 'status'));
    return { targetIsAttacker: true, status: 'sleep', sleepTurns: 0, logs };
  }

  // Don't stack status (except confusion)
  if (defenderCurrentStatus && ailment !== 'confusion') return null;

  switch (ailment) {
    case 'paralysis':
      logs.push(createLog(`${defenderName} was paralyzed!`, 'status'));
      return { targetIsAttacker: false, status: ailment, logs };
    case 'burn':
      logs.push(createLog(`${defenderName} was burned!`, 'status'));
      return { targetIsAttacker: false, status: ailment, logs };
    case 'poison':
      logs.push(createLog(`${defenderName} was poisoned!`, 'status'));
      return { targetIsAttacker: false, status: ailment, logs };
    case 'freeze':
      logs.push(createLog(`${defenderName} was frozen solid!`, 'status'));
      return { targetIsAttacker: false, status: ailment, logs };
    case 'sleep':
      logs.push(createLog(`${defenderName} fell asleep!`, 'status'));
      return { targetIsAttacker: false, status: 'sleep', sleepTurns: 0, logs };
    case 'confusion': {
      const turns = Math.floor(Math.random() * 4) + 1;
      logs.push(createLog(`${defenderName} became confused!`, 'status'));
      return { targetIsAttacker: false, status: 'confusion', confusionTurns: turns, logs };
    }
    default:
      return null;
  }
}

/**
 * Calculates end-of-turn damage from burn or poison.
 * Returns 1/16 of max HP.
 */
export function calculateEndTurnStatusDamage(status: string | null, maxHp: number): number {
  if (status === 'burn' || status === 'poison') {
    return Math.floor(maxHp / 16);
  }
  return 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function createLog(message: string, type: BattleLogEntry['type']): BattleLogEntry {
  return { message, type, timestamp: Date.now() };
}
