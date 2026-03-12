import { Pokemon } from './pokemon.model';
import { SelectedMove } from './move.model';

/**
 * Battle-specific model interfaces used across battle components and helpers.
 */

// ─── Battle Log ─────────────────────────────────────────────────────────────

export type BattleLogType = 'action' | 'damage' | 'status' | 'stat' | 'effect' | 'info';

export interface BattleLogEntry {
  message: string;
  type: BattleLogType;
  timestamp: number;
}

// ─── Turn Resolution ────────────────────────────────────────────────────────

export interface TurnOrder {
  first: TurnParticipant;
  second: TurnParticipant;
}

export interface TurnParticipant {
  pokemon: Pokemon;
  move: SelectedMove;
  isPokemon1: boolean;
}

// ─── Status Effects ─────────────────────────────────────────────────────────

export interface CanActResult {
  canAct: boolean;
  selfDamage: number;
  logs: BattleLogEntry[];
  newSleepTurns: number;
  newConfusionTurns: number;
  statusCleared: boolean;
}

export interface StatusApplicationResult {
  targetIsAttacker: boolean;
  status: string;
  confusionTurns?: number;
  sleepTurns?: number;
  logs: BattleLogEntry[];
}

// ─── Stat Changes ───────────────────────────────────────────────────────────

export interface StatChangeResult {
  targetIsAttacker: boolean;
  statName: string;
  newStage: number;
  log: BattleLogEntry;
}

// ─── Damage Calculation ─────────────────────────────────────────────────────

export interface DamageCalculationParams {
  attacker: Pokemon;
  defender: Pokemon;
  move: SelectedMove;
  attackerStatChanges: Record<string, number>;
  defenderStatChanges: Record<string, number>;
  attackerStatus: string | null;
}
