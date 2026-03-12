import { Injectable } from '@angular/core';
import { TYPE_CHART } from '../constants/type-chart.constant';
import { Pokemon } from '../models/pokemon.model';
import { SelectedMove } from '../models/move.model';
import { DamageCalculationParams } from '../models/battle.model';
import { getStatStageModifier, getBaseStat } from '../utils/stat-calculator.utils';

/**
 * Core battle engine service.
 * Contains pure battle logic: type effectiveness, damage calculation, etc.
 */
@Injectable({ providedIn: 'root' })
export class BattleEngineService {

  /**
   * Calculates the combined type effectiveness multiplier.
   * Returns 0 for immune, < 1 for resisted, 1 for neutral, > 1 for super effective.
   */
  calculateTypeModifier(moveType: string, defenderTypes: string[]): number {
    if (!moveType || !defenderTypes?.length) return 1;

    let modifier = 1;
    for (const defType of defenderTypes) {
      const chart = TYPE_CHART[moveType];
      if (chart && chart[defType] !== undefined) {
        modifier *= chart[defType];
      }
    }
    return modifier;
  }

  /**
   * Calculates damage for one attack, taking into account stat stages and status.
   */
  calculateDamage(params: DamageCalculationParams): number {
    const { attacker, defender, move, attackerStatChanges, defenderStatChanges, attackerStatus } = params;

    if (!move.power || move.power === 0) return 0;

    const isSpecial = move.damage_class?.name === 'special';
    const atkStatName = isSpecial ? 'special-attack' : 'attack';
    const defStatName = isSpecial ? 'special-defense' : 'defense';

    const baseAtk = getBaseStat(attacker, atkStatName);
    const baseDef = getBaseStat(defender, defStatName);

    const atkModifier = getStatStageModifier(attackerStatChanges[atkStatName] ?? 0);
    const defModifier = getStatStageModifier(defenderStatChanges[defStatName] ?? 0);

    const atk = Math.floor(baseAtk * atkModifier);
    const def = Math.floor(baseDef * defModifier);

    const power = move.power;
    const stab = attacker.types.some(t => t.type.name === move.type?.name) ? 1.5 : 1;
    const typeMultiplier = this.calculateTypeModifier(
      move.type?.name ?? '',
      defender.types.map(t => t.type.name),
    );

    if (typeMultiplier === 0) return 0;

    // Burn halves physical damage
    const burnModifier = (attackerStatus === 'burn' && !isSpecial) ? 0.5 : 1;

    return Math.max(1, Math.floor((power + atk * stab * typeMultiplier) * burnModifier - def));
  }

  /**
   * Returns battle-relevant base stats for a Pokémon (convenience method).
   */
  getBattleStats(pokemon: Pokemon) {
    return {
      attack:    getBaseStat(pokemon, 'attack'),
      defense:   getBaseStat(pokemon, 'defense'),
      spAttack:  getBaseStat(pokemon, 'special-attack'),
      spDefense: getBaseStat(pokemon, 'special-defense'),
      speed:     getBaseStat(pokemon, 'speed'),
      hp:        getBaseStat(pokemon, 'hp'),
    };
  }
}
