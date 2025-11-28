import { Component, signal } from '@angular/core';
import { MoveService } from '../../service/move.service';
import { SelectedMove } from '../../module/move';
import { Move } from '../../module/pokemon';
import { PokemonComponent } from '../pokemon-generator/pokemon';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Pokemon } from '../../module/pokemon';
import { PokemonService } from '../../service/pokemon';
import { forkJoin } from 'rxjs';
import { BattleService } from '../../service/battle.service';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule, HttpClientModule, PokemonComponent],
  templateUrl: './battle.html',
  styleUrls: ['./battle.scss']
})
export class BattleComponent {
  pokemon1 = signal<Pokemon | undefined>(undefined);
  pokemon2 = signal<Pokemon | undefined>(undefined);
  isLoading = signal(false);

  pokemon1CurrentHp = signal<number>(0);
  pokemon2CurrentHp = signal<number>(0);

  showModal = signal(false);
  modalPokemon = signal<Pokemon | undefined>(undefined);

  pokemon1Moves = signal<SelectedMove[]>([]);
  pokemon2Moves = signal<SelectedMove[]>([]);

  // Stato dei PP delle mosse
  pokemon1MovePP = signal<{ [moveName: string]: number }>({});
  pokemon2MovePP = signal<{ [moveName: string]: number }>({});

  // Modale vittoria
  showVictoryModal = signal(false);
  victorySprite: string | null = null;
  victoryText: string = '';

  // Stato del turno: 'choose1' -> 'choose2' -> 'resolve'
  turnState = signal<'choose1' | 'choose2' | 'resolve'>('choose1');
  selectedMove1: SelectedMove | null = null;
  selectedMove2: SelectedMove | null = null;

  constructor(
    private http: HttpClient,
    private pokemonService: PokemonService,
    private moveService: MoveService,
    private battleService: BattleService
  ) { }

  ngOnInit() {
    this.generateBattle();
  }

  generateBattle() {
    this.isLoading.set(true);
    forkJoin([
      this.pokemonService.getRandomPokemon(),
      this.pokemonService.getRandomPokemon()
    ]).subscribe({
      next: ([poke1, poke2]) => {
        this.pokemon1.set(poke1);
        this.pokemon2.set(poke2);
        this.pokemon1CurrentHp.set(this.getHpBaseStat(poke1));
        this.pokemon2CurrentHp.set(this.getHpBaseStat(poke2));

        const moves1 = this.pokemonRandomMoves(poke1, 4) as Move[];
        const moves2 = this.pokemonRandomMoves(poke2, 4) as Move[];

        this.moveService.fetchMovesDetails(moves1).subscribe({
          next: (enriched: SelectedMove[]) => {
            this.pokemon1Moves.set(enriched);
            // Inizializza PP
            const ppObj: { [moveName: string]: number } = {};
            for (const m of enriched) ppObj[m.name] = m.pp ?? 0;
            this.pokemon1MovePP.set(ppObj);
          },
          error: () => {
            this.pokemon1Moves.set(moves1.map(m => ({ name: m.name } as SelectedMove)));
            this.pokemon1MovePP.set({});
          }
        });
        this.moveService.fetchMovesDetails(moves2).subscribe({
          next: (enriched: SelectedMove[]) => {
            this.pokemon2Moves.set(enriched);
            // Inizializza PP
            const ppObj: { [moveName: string]: number } = {};
            for (const m of enriched) ppObj[m.name] = m.pp ?? 0;
            this.pokemon2MovePP.set(ppObj);
          },
          error: () => {
            this.pokemon2Moves.set(moves2.map(m => ({ name: m.name } as SelectedMove)));
            this.pokemon2MovePP.set({});
          }
        });

        this.isLoading.set(false);
      },
      error: (err) => {
        this.pokemon1.set(undefined);
        this.pokemon2.set(undefined);
        this.isLoading.set(false);
        console.error('Errore caricamento Pokémon:', err);
      }
    });
  }

  // Copiata da pokemon.component.ts
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

  getShowdownFront(pokemon: Pokemon | undefined): string | null {
    return pokemon?.sprites?.other?.showdown?.front_default || null;
  }

  getShowdownBack(pokemon: Pokemon | undefined): string | null {
    return pokemon?.sprites?.other?.showdown?.back_default || null;
  }

  openModal(pokemon: Pokemon) {
    this.modalPokemon.set(pokemon);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.modalPokemon.set(undefined);
  }

  getHpBar(pokemon: Pokemon | undefined): number {
    if (!pokemon) return 0;
    const hpStat = pokemon.stats.find(stat => stat.stat.name === 'hp');
    if (!hpStat) return 0;
    const hpValue = hpStat.base_stat;
    const hpBar = Math.min(Math.max((hpValue * 2 + 110), 0), 100);
    return hpBar;
  }

  getHpBaseStat(pokemon: Pokemon | undefined): number {
    if (!pokemon) return 0;
    const hpStat = pokemon.stats.find(stat => stat.stat.name === 'hp');
    const calcHp = (hpStat?.base_stat ?? 0) * 2 + 110;
    return calcHp;
  }


  getHpPercentage(currentHp: number, pokemon: Pokemon | undefined): number {
    const maxHp = this.getHpBaseStat(pokemon);
    if (maxHp === 0) return 0;
    return Math.round((currentHp / maxHp) * 100);
  }

  getHpBarClass(percentage: number): string {
    if (percentage <= 20) return 'critical';
    if (percentage <= 50) return 'warning';
    return 'healthy';
  }

  // Decrementa i PP e blocca la mossa se finiti
  onSelectMove1(move: SelectedMove) {
    const ppObj = { ...this.pokemon1MovePP() };
    if (ppObj[move.name] > 0) {
      ppObj[move.name]--;
      this.pokemon1MovePP.set(ppObj);
      this.selectedMove1 = move;
      this.turnState.set('choose2');
    }
  }
  onSelectMove2(move: SelectedMove) {
    const ppObj = { ...this.pokemon2MovePP() };
    if (ppObj[move.name] > 0) {
      ppObj[move.name]--;
      this.pokemon2MovePP.set(ppObj);
      this.selectedMove2 = move;
      this.turnState.set('resolve');
      this.resolveTurn();
    }
  }

  getSpeed100(pokemon: Pokemon | undefined): number {
    if (!pokemon) return 0;
    const base = pokemon.stats.find(s => s.stat.name === 'speed')?.base_stat ?? 50;
    return base * 2 + 5;
  }

  calculateCustomDamage(attacker: Pokemon | undefined, defender: Pokemon | undefined, move: SelectedMove): number {
    if (!attacker || !defender) return 0;
    if (!move.power || move.power === 0) return 0;
    const isSpecial = move.damage_class?.name === 'special';
    const atk = isSpecial
      ? attacker.stats.find(s => s.stat.name === 'special-attack')?.base_stat ?? 50
      : attacker.stats.find(s => s.stat.name === 'attack')?.base_stat ?? 50;
    const def = isSpecial
      ? defender.stats.find(s => s.stat.name === 'special-defense')?.base_stat ?? 50
      : defender.stats.find(s => s.stat.name === 'defense')?.base_stat ?? 50;
    const power = move.power;
    const stab = attacker.types.some(t => t.type.name === move.type?.name) ? 1.5 : 1;
    const typeMultiplier = this.battleService.calculateTypeModifier(move.type?.name ?? '', defender.types.map(t => t.type.name));
    // Formula richiesta
    const damage = Math.max(1, Math.floor((power + (atk * stab * typeMultiplier)) - def));
    return damage;
  }

  resolveTurn() {
    // Calcola priorità (se presente)
    const prio1 = this.selectedMove1?.priority ?? 0;
    const prio2 = this.selectedMove2?.priority ?? 0;
    let first: Pokemon | undefined, second: Pokemon | undefined, moveFirst: SelectedMove | null, moveSecond: SelectedMove | null;
    if (prio1 > prio2) {
      first = this.pokemon1(); second = this.pokemon2();
      moveFirst = this.selectedMove1; moveSecond = this.selectedMove2;
    } else if (prio2 > prio1) {
      first = this.pokemon2(); second = this.pokemon1();
      moveFirst = this.selectedMove2; moveSecond = this.selectedMove1;
    } else {
      // Se priorità uguale, decide la velocità
      const speed1 = this.getSpeed100(this.pokemon1());
      const speed2 = this.getSpeed100(this.pokemon2());
      if (speed1 >= speed2) {
        first = this.pokemon1(); second = this.pokemon2();
        moveFirst = this.selectedMove1; moveSecond = this.selectedMove2;
      } else {
        first = this.pokemon2(); second = this.pokemon1();
        moveFirst = this.selectedMove2; moveSecond = this.selectedMove1;
      }
    }
    // Applica danno al primo attacco
    let hpSecond = this[second === this.pokemon1() ? 'pokemon1CurrentHp' : 'pokemon2CurrentHp']();
    hpSecond -= this.calculateCustomDamage(first, second, moveFirst!);
    hpSecond = Math.max(0, hpSecond);
    this[second === this.pokemon1() ? 'pokemon1CurrentHp' : 'pokemon2CurrentHp'].set(hpSecond);

    // Timeout tra il primo e il secondo attacco
    if (hpSecond > 0) {
      setTimeout(() => {
        let hpFirst = this[first === this.pokemon1() ? 'pokemon1CurrentHp' : 'pokemon2CurrentHp']();
        hpFirst -= this.calculateCustomDamage(second, first, moveSecond!);
        hpFirst = Math.max(0, hpFirst);
        this[first === this.pokemon1() ? 'pokemon1CurrentHp' : 'pokemon2CurrentHp'].set(hpFirst);

        // Mostra modale vittoria se un Pokémon va KO
        this.checkVictoryAndReset();
      }, 700); // 700ms di attesa tra i due attacchi
    } else {
      // Mostra modale vittoria se un Pokémon va KO
      this.checkVictoryAndReset();
    }

  }

  // Funzione di supporto per mostrare la vittoria e resettare il turno
  private checkVictoryAndReset() {
    if (this.pokemon1CurrentHp() <= 0) {
      this.victorySprite = this.getShowdownFront(this.pokemon2()) || this.pokemon2()?.sprites?.front_default || null;
      this.victoryText = `${this.pokemon2()?.name} vince!`;
      this.showVictoryModal.set(true);
    } else if (this.pokemon2CurrentHp() <= 0) {
      this.victorySprite = this.getShowdownFront(this.pokemon1()) || this.pokemon1()?.sprites?.front_default || null;
      this.victoryText = `${this.pokemon1()?.name} vince!`;
      this.showVictoryModal.set(true);
    }
    // Reset per il prossimo turno
    this.selectedMove1 = null;
    this.selectedMove2 = null;
    this.turnState.set('choose1');
  }

}