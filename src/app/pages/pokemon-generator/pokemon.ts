import { Component, signal, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Pokemon, Move } from '../../module/pokemon';
import { SelectedMove } from '../../module/move';
import { MoveService } from '../../service/move.service';
import { Router } from '@angular/router';


@Component({
    selector: 'app-pokemon',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './pokemon.html',
    styleUrls: ['./pokemon.scss']
})
export class PokemonComponent implements OnChanges {
    @Input() pokemonInput?: Pokemon;
    title = signal('pokemon-battle');
    pokemon = signal<Pokemon | undefined>(undefined);
    selectedMoves = signal<SelectedMove[]>([]);



    constructor(private http: HttpClient, private moveService: MoveService, private router: Router) { }

    ngOnInit(): void {
        if (!this.pokemonInput) {
            this.generatePokemon();

        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['pokemonInput'] && this.pokemonInput) {
            this.setPokemon(this.pokemonInput);
        }
    }

    get isBattlePage(): boolean {
        if (this.router.url.includes('battle')) {
            return true;
        }
        return false;
    }

    setPokemon(pokemon: Pokemon) {
        this.pokemon.set(pokemon);
        const moves = this.pokemonRandomMoves(pokemon, 4) as Move[];
        if (!moves || !moves.length) { this.selectedMoves.set([]); return; }
        this.moveService.fetchMovesDetails(moves).subscribe({
            next: (enriched: SelectedMove[]) => this.selectedMoves.set(enriched),
            error: () => this.selectedMoves.set(moves.map(m => ({ name: m.name } as SelectedMove)))
        });
    }

    randomPokemonId(): number {
        return Math.floor(Math.random() * 1025) + 1;
    }

    pokemonBstCalculator(pokemon: Pokemon): number {
        return pokemon.stats.reduce((total, stat) => total + stat.base_stat, 0);
    }

    pokemonRandomMoves(pokemon: Pokemon, count = 4) {
        const moves = (pokemon.moves ?? []).map(m => m.move);
        const n = moves.length;
        if (n <= count) return moves;

        const arr = moves.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }

        return arr.slice(0, count);
    }

    generatePokemon() {
        this.http.get<Pokemon>(`https://pokeapi.co/api/v2/pokemon/${this.randomPokemonId()}/`)
            .subscribe((data: Pokemon) => {
                this.setPokemon(data);
            });
    }
}
