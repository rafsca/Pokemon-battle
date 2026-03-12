import { Component, signal, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Pokemon, MoveReference } from '../../../core/models/pokemon.model';
import { SelectedMove } from '../../../core/models/move.model';
import { MoveApiService } from '../../../core/services/move-api.service';
import { PokemonApiService } from '../../../core/services/pokemon-api.service';
import { getModifiedStat, calculateBst } from '../../../core/utils/stat-calculator.utils';

/**
 * Reusable Pokémon card component.
 * Can operate in two modes:
 *  - Standalone: fetches a random Pokémon on init (pokemon-generator page).
 *  - Embedded: receives a Pokémon via `pokemonInput` (battle modal).
 */
@Component({
  selector: 'app-pokemon-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pokemon-card.component.html',
  styleUrls: ['./pokemon-card.component.scss'],
})
export class PokemonCardComponent implements OnChanges {
  @Input() pokemonInput?: Pokemon;
  @Input() set statChanges(changes: Record<string, number> | undefined) {
    this.statChangesSignal.set(changes ?? {});
  }

  pokemon = signal<Pokemon | undefined>(undefined);
  selectedMoves = signal<SelectedMove[]>([]);
  statChangesSignal = signal<Record<string, number>>({});

  get currentStatChanges(): Record<string, number> {
    return this.statChangesSignal();
  }

  constructor(
    private readonly pokemonApi: PokemonApiService,
    private readonly moveApi: MoveApiService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.pokemonInput) {
      this.generateRandomPokemon();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pokemonInput'] && this.pokemonInput) {
      this.loadPokemonData(this.pokemonInput);
    }
  }

  /** Whether the component is displayed inside the battle page. */
  get isBattlePage(): boolean {
    return this.router.url.includes('battle');
  }

  /** Calculates the modified stat considering stage changes. */
  getModifiedStat(baseStat: number, statName: string): number {
    const stage = this.currentStatChanges[statName] ?? 0;
    return getModifiedStat(baseStat, stage, statName === 'hp');
  }

  /** Calculates the Base Stat Total. */
  calculateBst(pokemon: Pokemon): number {
    return calculateBst(pokemon);
  }

  /** Fetches a random Pokémon from the API. */
  generateRandomPokemon(): void {
    this.pokemonApi.getRandomPokemon().subscribe({
      next: (data) => this.loadPokemonData(data),
      error: (err) => console.error('Failed to fetch Pokémon:', err),
    });
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private loadPokemonData(pokemon: Pokemon): void {
    this.pokemon.set(pokemon);
    const moves = this.selectRandomMoves(pokemon, 4);
    if (!moves.length) {
      this.selectedMoves.set([]);
      return;
    }
    this.moveApi.fetchMovesDetails(moves).subscribe({
      next: (enriched) => this.selectedMoves.set(enriched),
      error: () => this.selectedMoves.set(moves.map(m => ({ name: m.name } as SelectedMove))),
    });
  }

  private selectRandomMoves(pokemon: Pokemon, count: number): MoveReference[] {
    const moves = (pokemon.moves ?? []).map(m => m.move);
    if (moves.length <= count) return moves;

    // Fisher-Yates shuffle
    const arr = moves.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  }
}
