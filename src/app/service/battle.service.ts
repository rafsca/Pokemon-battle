import { Injectable } from '@angular/core';
import { Pokemon } from '../module/pokemon';
import { SelectedMove } from '../module/move';
import { TypeModifier } from '@angular/compiler';

@Injectable({ providedIn: 'root' })
export class BattleService {
    constructor() { }



    // Tabella delle efficacie dei tipi Pokémon (semplificata, solo attacco vs difesa)
    private typeChart: { [attacking: string]: { [defending: string]: number } } = {
        normal: { rock: 0.5, ghost: 0, steel: 0.5 },
        fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
        water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
        electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
        grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
        ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
        fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, ghost: 0, fairy: 0.5 },
        poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
        ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
        flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
        psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
        bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
        rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
        ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
        dragon: { dragon: 2, steel: 0.5, fairy: 0 },
        dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
        steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, fairy: 2, steel: 0.5 },
        fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
    };

    calculateTypeModifier(moveType: string, defenderTypes: string[]): number {
        if (!moveType || !defenderTypes?.length) return 1;
        let modifier = 1;
        for (const defType of defenderTypes) {
            const chart = this.typeChart[moveType];
            if (chart && chart[defType] !== undefined) {
                modifier *= chart[defType];
            } else {
                modifier *= 1;
            }
        }
        return modifier;
    }

    // Calcola il danno base tra due Pokémon
    calculateDamage(attacker: Pokemon, defender: Pokemon, move: SelectedMove): number {
        // Statistiche base
        const level = 50; // Livello fisso per semplicità
        const power = move.power ?? 40;
        const attackStat = move.damage_class?.name === 'special'
            ? attacker.stats.find(s => s.stat.name === 'special-attack')?.base_stat ?? 50
            : attacker.stats.find(s => s.stat.name === 'attack')?.base_stat ?? 50;
        const defenseStat = move.damage_class?.name === 'special'
            ? defender.stats.find(s => s.stat.name === 'special-defense')?.base_stat ?? 50
            : defender.stats.find(s => s.stat.name === 'defense')?.base_stat ?? 50;

        // Modificatore di tipo
        const defenderTypes = defender.types.map(t => t.type.name);
        const typeModifier = this.calculateTypeModifier(move.type?.name ?? '', defenderTypes);

        // STAB (Same Type Attack Bonus)
        const stab = attacker.types.some(t => t.type.name === move.type?.name) ? 1.5 : 1;

        // Random factor (tra 0.85 e 1)
        const random = 0.85 + Math.random() * 0.15;

        // Formula classica Pokémon
        const base = Math.floor(
            (((2 * level) / 5 + 2) * power * attackStat / defenseStat) / 50 + 2
        );
        const damage = Math.floor(base * stab * typeModifier * random);
        return Math.max(1, damage); // Minimo 1 danno
    }

    // Applica una mossa e restituisce il nuovo stato HP dei Pokémon
    applyMove(attacker: Pokemon, defender: Pokemon, move: SelectedMove, defenderCurrentHp: number): number {
        const damage = this.calculateDamage(attacker, defender, move);
        return Math.max(0, defenderCurrentHp - damage);
    }

    // Gestisce il turno di battaglia (da estendere per logica avanzata)
    battleTurn(pokemon1: Pokemon, pokemon2: Pokemon, move1: SelectedMove, move2: SelectedMove, hp1: number, hp2: number): { hp1: number, hp2: number } {
        // Esempio: entrambi attaccano
        const newHp2 = this.applyMove(pokemon1, pokemon2, move1, hp2);
        const newHp1 = this.applyMove(pokemon2, pokemon1, move2, hp1);
        return { hp1: newHp1, hp2: newHp2 };
    }

    // Calcola e restituisce un oggetto con le statistiche base utili per la battaglia
    getBattleStats(pokemon: Pokemon): { attack: number, defense: number, spAttack: number, spDefense: number, speed: number, hp: number } {
        return {
            attack: pokemon.stats.find(s => s.stat.name === 'attack')?.base_stat ?? 50,
            defense: pokemon.stats.find(s => s.stat.name === 'defense')?.base_stat ?? 50,
            spAttack: pokemon.stats.find(s => s.stat.name === 'special-attack')?.base_stat ?? 50,
            spDefense: pokemon.stats.find(s => s.stat.name === 'special-defense')?.base_stat ?? 50,
            speed: pokemon.stats.find(s => s.stat.name === 'speed')?.base_stat ?? 50,
            hp: pokemon.stats.find(s => s.stat.name === 'hp')?.base_stat ?? 50,
        };
    }
}
