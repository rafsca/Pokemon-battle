import { Pokemon } from '../../../core/models/pokemon.model';
import { SelectedMove } from '../../../core/models/move.model';
import { TurnOrder } from '../../../core/models/battle.model';
import { calculateEffectiveSpeed } from '../../../core/utils/stat-calculator.utils';

/**
 * Determines which Pokémon attacks first based on move priority and speed.
 */
export function determineTurnOrder(
  pokemon1: Pokemon,
  pokemon2: Pokemon,
  move1: SelectedMove,
  move2: SelectedMove,
  p1StatChanges: Record<string, number>,
  p2StatChanges: Record<string, number>,
  p1Status: string | null,
  p2Status: string | null,
): TurnOrder {
  const priority1 = move1?.priority ?? 0;
  const priority2 = move2?.priority ?? 0;

  if (priority1 > priority2) {
    return buildTurnOrder(pokemon1, move1, true, pokemon2, move2);
  }

  if (priority2 > priority1) {
    return buildTurnOrder(pokemon2, move2, false, pokemon1, move1);
  }

  // Same priority → compare speed
  const speed1 = calculateEffectiveSpeed(pokemon1, p1StatChanges, p1Status);
  const speed2 = calculateEffectiveSpeed(pokemon2, p2StatChanges, p2Status);

  if (speed1 >= speed2) {
    return buildTurnOrder(pokemon1, move1, true, pokemon2, move2);
  }
  return buildTurnOrder(pokemon2, move2, false, pokemon1, move1);
}

function buildTurnOrder(
  firstPokemon: Pokemon,
  firstMove: SelectedMove,
  firstIsPokemon1: boolean,
  secondPokemon: Pokemon,
  secondMove: SelectedMove,
): TurnOrder {
  return {
    first:  { pokemon: firstPokemon,  move: firstMove,  isPokemon1: firstIsPokemon1 },
    second: { pokemon: secondPokemon, move: secondMove, isPokemon1: !firstIsPokemon1 },
  };
}
