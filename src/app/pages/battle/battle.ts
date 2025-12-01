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
import { BattleLogComponent, BattleLogEntry } from '../../components/battle-log/battle-log.component';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule, HttpClientModule, PokemonComponent, BattleLogComponent],
  templateUrl: './battle.html',
  styleUrls: ['./battle.scss']
})
export class BattleComponent {
  // Animazione attacco
  pokemon1Attacking = signal<boolean>(false);
  pokemon2Attacking = signal<boolean>(false);
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

  // Modifiche alle statistiche (stage da -6 a +6)
  pokemon1StatChanges = signal<{ [stat: string]: number }>({});
  pokemon2StatChanges = signal<{ [stat: string]: number }>({});

  // Condizioni di stato: paralysis, burn, poison, sleep, freeze, confusion
  pokemon1Status = signal<string | null>(null);
  pokemon2Status = signal<string | null>(null);
  pokemon1SleepTurns = signal<number>(0);
  pokemon2SleepTurns = signal<number>(0);
  pokemon1ConfusionTurns = signal<number>(0);
  pokemon2ConfusionTurns = signal<number>(0);

  // Battle Log
  battleLogs = signal<BattleLogEntry[]>([]);

  // Per mostrare le stat correnti nel modale
  modalPokemonStats = signal<{ [key: string]: number }>({});

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
    // Reset battle logs
    this.battleLogs.set([]);

    forkJoin([
      this.pokemonService.getRandomPokemon(),
      this.pokemonService.getRandomPokemon()
    ]).subscribe({
      next: ([poke1, poke2]) => {
        this.pokemon1.set(poke1);
        this.pokemon2.set(poke2);
        this.pokemon1CurrentHp.set(this.getHpBaseStat(poke1));
        this.pokemon2CurrentHp.set(this.getHpBaseStat(poke2));

        // Reset stat changes e status
        this.pokemon1StatChanges.set({});
        this.pokemon2StatChanges.set({});
        this.pokemon1Status.set(null);
        this.pokemon2Status.set(null);
        this.pokemon1SleepTurns.set(0);
        this.pokemon2SleepTurns.set(0);
        this.pokemon1ConfusionTurns.set(0);
        this.pokemon2ConfusionTurns.set(0);

        // Log inizio battaglia
        this.addLog(`A wild battle begins!`, 'info');
        this.addLog(`${poke1.name} vs ${poke2.name}!`, 'info');

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
    // Passa le stat changes del pokemon selezionato
    if (pokemon === this.pokemon1()) {
      this.modalPokemonStats.set(this.pokemon1StatChanges());
    } else {
      this.modalPokemonStats.set(this.pokemon2StatChanges());
    }
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.modalPokemon.set(undefined);
  }

  // Aggiungi log alla battaglia
  addLog(message: string, type: BattleLogEntry['type'] = 'info') {
    const newLog: BattleLogEntry = {
      message,
      type,
      timestamp: Date.now()
    };
    this.battleLogs.update(logs => [...logs, newLog]);
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

  // Converte lo status nella sua abbreviazione
  getStatusAbbreviation(status: string | null): string {
    if (!status) return '';
    const abbreviations: { [key: string]: string } = {
      'paralysis': 'PAR',
      'burn': 'BRN',
      'poison': 'PSN',
      'sleep': 'SLP',
      'freeze': 'FRZ',
      'confusion': 'CNF'
    };
    return abbreviations[status] ?? status.toUpperCase();
  }

  // Decrementa i PP e blocca la mossa se finiti
  onSelectMove1(move: SelectedMove) {
    const ppObj = { ...this.pokemon1MovePP() };
    if (ppObj[move.name] > 0) {
      ppObj[move.name]--;
      this.pokemon1MovePP.set(ppObj);
      this.selectedMove1 = move;
      this.addLog(`${this.pokemon1()?.name} selected ${move.name}!`, 'action');
      this.turnState.set('choose2');
    }
  }
  onSelectMove2(move: SelectedMove) {
    const ppObj = { ...this.pokemon2MovePP() };
    if (ppObj[move.name] > 0) {
      ppObj[move.name]--;
      this.pokemon2MovePP.set(ppObj);
      this.selectedMove2 = move;
      this.addLog(`${this.pokemon2()?.name} selected ${move.name}!`, 'action');
      this.turnState.set('resolve');
      this.resolveTurn();
    }
  }

  getSpeed100(pokemon: Pokemon | undefined): number {
    if (!pokemon) return 0;
    const base = pokemon.stats.find(s => s.stat.name === 'speed')?.base_stat ?? 50;
    const statChanges = pokemon === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges();
    const modifier = this.getStatModifier(statChanges['speed'] ?? 0);

    // Paralisi riduce la velocità del 50%
    const status = pokemon === this.pokemon1() ? this.pokemon1Status() : this.pokemon2Status();
    const paralysisModifier = status === 'paralysis' ? 0.5 : 1;

    return Math.floor((base * 2 + 5) * modifier * paralysisModifier);
  }

  // Calcola il moltiplicatore per uno stage di stat (-6 a +6)
  getStatModifier(stage: number): number {
    const clampedStage = Math.max(-6, Math.min(6, stage));
    if (clampedStage >= 0) {
      return (2 + clampedStage) / 2;
    } else {
      return 2 / (2 - clampedStage);
    }
  }

  // Determina se la mossa colpisce se stessi o l'avversario
  // Ritorna 'self' se colpisce l'utilizzatore, 'opponent' se colpisce l'avversario
  getMoveTarget(move: SelectedMove): 'self' | 'opponent' {
    const targetName = move.target?.name ?? '';

    // Target che colpiscono l'utilizzatore
    const selfTargets = [
      'user',
      'user-and-allies',
      'users-field',
      'all-allies',
      'user-or-ally'
    ];

    // Target che colpiscono l'avversario
    const opponentTargets = [
      'selected-pokemon',
      'specific-move',
      'selected-pokemon-me-first',
      'opponent',
      'all-opponents',
      'all-other-pokemon',
      'random-opponent'
    ];

    if (selfTargets.includes(targetName)) {
      return 'self';
    }

    if (opponentTargets.includes(targetName)) {
      return 'opponent';
    }

    return 'opponent'; // Default a opponent per sicurezza
  }

  // Applica le modifiche alle statistiche dalla mossa
  applyStatChanges(move: SelectedMove, attacker: Pokemon | undefined, defender: Pokemon | undefined) {
    if (!move.stat_changes || !Array.isArray(move.stat_changes) || move.stat_changes.length === 0) return;

    // Ottieni la probabilità di applicare i cambiamenti stat
    // stat_chance = 0 significa 100% (mosse di stato pure come Swords Dance)
    // stat_chance > 0 significa quella percentuale (es. 10% per effetti secondari)
    const statChance = move.meta?.stat_chance ?? 0;
    const chance = statChance === 0 ? 100 : statChance;

    // Verifica se l'effetto si attiva
    if (Math.random() * 100 >= chance) return;

    const isAttackerPokemon1 = attacker === this.pokemon1();
    const moveTarget = this.getMoveTarget(move);
    const metaCategory = move.meta?.category?.name ?? '';

    for (const change of move.stat_changes) {
      const statName = change.stat?.name;
      const changeAmount = change.change ?? 0;
      if (!statName || changeAmount === 0) continue;

      let targetSignal: ReturnType<typeof signal<{ [stat: string]: number }>>;

      // Logica per determinare chi riceve lo stat change basata su meta.category:
      // - "damage+lower" = danno + abbassa stat del BERSAGLIO (es. Bug Buzz, Psychic, Shadow Ball)
      // - "damage+raise" = danno + modifica stat dell'UTILIZZATORE (es. Close Combat abbassa le proprie difese)
      // - "net-good-stats" = mosse di stato che alzano le proprie stat (Swords Dance, Calm Mind)
      // - "damage" con stat_changes = effetto secondario sul bersaglio
      // Per mosse senza meta.category, usa il target della mossa

      let applySelf: boolean;

      if (metaCategory === 'damage+raise') {
        // Mosse come Close Combat: fanno danno ma modificano le stat dell'utilizzatore
        applySelf = true;
      } else if (metaCategory === 'damage+lower') {
        // Mosse come Bug Buzz, Psychic: fanno danno e abbassano stat del bersaglio
        applySelf = false;
      } else if (metaCategory === 'net-good-stats') {
        // Mosse di potenziamento (Swords Dance, ecc.), MA controlla il target
        // Captivate ha net-good-stats ma colpisce gli opponent con stat negativi
        applySelf = moveTarget === 'self';
      } else {
        // Default: segui il target della mossa
        applySelf = moveTarget === 'self';
      }

      if (applySelf) {
        targetSignal = isAttackerPokemon1 ? this.pokemon1StatChanges : this.pokemon2StatChanges;
      } else {
        targetSignal = isAttackerPokemon1 ? this.pokemon2StatChanges : this.pokemon1StatChanges;
      }

      const currentChanges = { ...targetSignal() };
      const currentStage = currentChanges[statName] ?? 0;
      const newStage = Math.max(-6, Math.min(6, currentStage + changeAmount));
      currentChanges[statName] = newStage;
      targetSignal.set(currentChanges);

      // Log del cambio stat
      const targetPokemon = applySelf ? attacker : defender;
      const changeText = changeAmount > 0 ? 'rose' : 'fell';
      const amountText = Math.abs(changeAmount) === 1 ? '' : ' sharply';
      this.addLog(`${targetPokemon?.name}'s ${statName.replace('-', ' ')}${amountText} ${changeText}!`, 'stat');
    }
  }

  // Applica condizione di stato
  applyStatusCondition(move: SelectedMove, attacker: Pokemon | undefined, defender: Pokemon | undefined) {
    const ailment = move.meta?.ailment?.name;
    const ailmentChance = move.meta?.ailment_chance ?? 0;

    // Se la mossa non ha ailment o è 'none', esci
    if (!ailment || ailment === 'none') return;

    // Verifica la probabilità (0 significa 100% per mosse di stato pure)
    const chance = ailmentChance === 0 ? 100 : ailmentChance;
    if (Math.random() * 100 > chance) return;

    const isAttackerPokemon1 = attacker === this.pokemon1();

    // Determina il target per la condizione di stato
    const moveTarget = this.getMoveTarget(move);
    let targetStatusSignal: ReturnType<typeof signal<string | null>>;

    // Le condizioni di stato negative vanno sempre sull'avversario (a meno che non sia Rest)
    if (moveTarget === 'self' && ailment === 'sleep' && move.name === 'rest') {
      // Rest addormenta se stessi per curarsi
      targetStatusSignal = isAttackerPokemon1 ? this.pokemon1Status : this.pokemon2Status;
    } else {
      // Tutte le altre condizioni di stato vanno sull'avversario
      targetStatusSignal = isAttackerPokemon1 ? this.pokemon2Status : this.pokemon1Status;
    }

    // Non applicare se già ha uno status (eccetto confusione che può essere aggiunta)
    if (targetStatusSignal() && ailment !== 'confusion') return;

    const targetPokemon = (moveTarget === 'self' && ailment === 'sleep') ? attacker : defender;

    switch (ailment) {
      case 'paralysis':
        targetStatusSignal.set(ailment);
        this.addLog(`${targetPokemon?.name} was paralyzed!`, 'status');
        break;
      case 'burn':
        targetStatusSignal.set(ailment);
        this.addLog(`${targetPokemon?.name} was burned!`, 'status');
        break;
      case 'poison':
        targetStatusSignal.set(ailment);
        this.addLog(`${targetPokemon?.name} was poisoned!`, 'status');
        break;
      case 'freeze':
        targetStatusSignal.set(ailment);
        this.addLog(`${targetPokemon?.name} was frozen solid!`, 'status');
        break;
      case 'sleep':
        targetStatusSignal.set('sleep');
        this.addLog(`${targetPokemon?.name} fell asleep!`, 'status');
        // Inizia il conteggio turni da 0, incrementerà in canAct()
        if (isAttackerPokemon1) {
          this.pokemon2SleepTurns.set(0);
        } else {
          this.pokemon1SleepTurns.set(0);
        }
        break;
      case 'confusion':
        const confTurns = Math.floor(Math.random() * 4) + 1; // 1-4 turni
        if (isAttackerPokemon1) {
          this.pokemon2ConfusionTurns.set(confTurns);
        } else {
          this.pokemon1ConfusionTurns.set(confTurns);
        }
        this.addLog(`${targetPokemon?.name} became confused!`, 'status');
        break;
    }
  }

  // Verifica se il Pokémon può agire (status effects)
  canAct(pokemon: Pokemon | undefined): { canAct: boolean, damage: number } {
    const isPokemon1 = pokemon === this.pokemon1();
    const status = isPokemon1 ? this.pokemon1Status() : this.pokemon2Status();
    const sleepTurns = isPokemon1 ? this.pokemon1SleepTurns : this.pokemon2SleepTurns;
    const confusionTurns = isPokemon1 ? this.pokemon1ConfusionTurns : this.pokemon2ConfusionTurns;
    const statusSignal = isPokemon1 ? this.pokemon1Status : this.pokemon2Status;

    let selfDamage = 0;
    const name = pokemon?.name || 'Il Pokémon';

    // Controllo sonno: 25% di probabilità di svegliarsi ogni turno, max 3 turni
    if (status === 'sleep') {
      const turns = sleepTurns();
      // Se ha dormito 3 turni, si sveglia automaticamente
      if (turns >= 3) {
        statusSignal.set(null);
        sleepTurns.set(0);
        this.addLog(`${name} si è svegliato!`, 'status');
        // Si sveglia ma può agire questo turno
      } else if (Math.random() < 0.25) {
        // 25% di probabilità di svegliarsi
        statusSignal.set(null);
        sleepTurns.set(0);
        this.addLog(`${name} si è svegliato!`, 'status');
        // Si sveglia ma può agire questo turno
      } else {
        // Resta addormentato, incrementa il contatore
        sleepTurns.set(turns + 1);
        return { canAct: false, damage: 0 };
      }
    }

    // Controllo congelamento (20% di scongelarsi)
    if (status === 'freeze') {
      if (Math.random() < 0.2) {
        // Si scongela e può agire
        statusSignal.set(null);
        this.addLog(`${name} si è scongelato!`, 'status');
      } else {
        // Resta congelato
        return { canAct: false, damage: 0 };
      }
    }

    // Controllo paralisi (25% di non agire)
    if (status === 'paralysis') {
      if (Math.random() < 0.25) {
        this.addLog(`${name} is paralyzed! It can't move!`, 'status');
        return { canAct: false, damage: 0 };
      }
    }

    // Controllo confusione
    if (confusionTurns() > 0) {
      const turnsLeft = confusionTurns() - 1;
      confusionTurns.set(turnsLeft);
      if (turnsLeft === 0) {
        this.addLog(`${name} non è più confuso!`, 'status');
      }
      if (Math.random() < 0.33) {
        // Si colpisce da solo: 40 power fisico
        const atk = pokemon?.stats.find(s => s.stat.name === 'attack')?.base_stat ?? 50;
        const def = pokemon?.stats.find(s => s.stat.name === 'defense')?.base_stat ?? 50;
        selfDamage = Math.max(1, Math.floor((40 + atk) - def));
        return { canAct: false, damage: selfDamage };
      }
    }

    return { canAct: true, damage: 0 };
  }

  // Applica danni da status a fine turno
  applyEndTurnStatusDamage(pokemon: Pokemon | undefined): number {
    const isPokemon1 = pokemon === this.pokemon1();
    const status = isPokemon1 ? this.pokemon1Status() : this.pokemon2Status();
    const maxHp = this.getHpBaseStat(pokemon);

    if (status === 'burn' || status === 'poison') {
      return Math.floor(maxHp / 16); // 1/16 del massimo HP
    }
    return 0;
  }

  calculateCustomDamage(attacker: Pokemon | undefined, defender: Pokemon | undefined, move: SelectedMove): number {
    if (!attacker || !defender) return 0;
    if (!move.power || move.power === 0) return 0;

    const isSpecial = move.damage_class?.name === 'special';
    const attackerStatChanges = attacker === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges();
    const defenderStatChanges = defender === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges();

    const atkStatName = isSpecial ? 'special-attack' : 'attack';
    const defStatName = isSpecial ? 'special-defense' : 'defense';

    const baseAtk = attacker.stats.find(s => s.stat.name === atkStatName)?.base_stat ?? 50;
    const baseDef = defender.stats.find(s => s.stat.name === defStatName)?.base_stat ?? 50;

    const atkModifier = this.getStatModifier(attackerStatChanges[atkStatName] ?? 0);
    const defModifier = this.getStatModifier(defenderStatChanges[defStatName] ?? 0);

    const atk = Math.floor(baseAtk * atkModifier);
    const def = Math.floor(baseDef * defModifier);

    const power = move.power;
    const stab = attacker.types.some(t => t.type.name === move.type?.name) ? 1.5 : 1;
    const typeMultiplier = this.battleService.calculateTypeModifier(move.type?.name ?? '', defender.types.map(t => t.type.name));

    // Se il tipo è immune (typeMultiplier = 0), nessun danno
    if (typeMultiplier === 0) return 0;

    // Riduzione danno da bruciatura per mosse fisiche
    const attackerStatus = attacker === this.pokemon1() ? this.pokemon1Status() : this.pokemon2Status();
    const burnModifier = (attackerStatus === 'burn' && !isSpecial) ? 0.5 : 1;

    const damage = Math.max(1, Math.floor((power + (atk * stab * typeMultiplier)) * burnModifier - def));
    return damage;
  }

  // Calcola se la mossa colpisce considerando accuracy ed evasion
  moveHits(move: SelectedMove, attacker: Pokemon | undefined, defender: Pokemon | undefined): boolean {
    // Mosse che non possono mancare (es. Swift)
    if (!move.accuracy || move.accuracy === null) return true;

    const attackerStatChanges = attacker === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges();
    const defenderStatChanges = defender === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges();

    // Ottieni stage di accuracy ed evasion
    const accuracyStage = attackerStatChanges['accuracy'] ?? 0;
    const evasionStage = defenderStatChanges['evasion'] ?? 0;

    // Calcola i moltiplicatori
    const accuracyMultiplier = this.getAccuracyEvasionModifier(accuracyStage);
    const evasionMultiplier = this.getAccuracyEvasionModifier(evasionStage);

    // Calcola la probabilità finale di colpire
    const finalAccuracy = (move.accuracy / 100) * (accuracyMultiplier / evasionMultiplier);

    // Tira il dado
    return Math.random() < finalAccuracy;
  }

  // Calcola il moltiplicatore per accuracy/evasion basato sullo stage
  getAccuracyEvasionModifier(stage: number): number {
    // Accuracy/Evasion usano la stessa scala: 3/3, 3/4, 3/5, 3/6, 3/7, 3/8, 3/9
    // Stage positivo aumenta accuracy o evasion, negativo le diminuisce
    const clampedStage = Math.max(-6, Math.min(6, stage));
    if (clampedStage >= 0) {
      return (3 + clampedStage) / 3;
    } else {
      return 3 / (3 - clampedStage);
    }
  }

  resolveTurn() {
    // Calcola priorità (se presente)
    const prio1 = this.selectedMove1?.priority ?? 0;
    const prio2 = this.selectedMove2?.priority ?? 0;
    let first: Pokemon | undefined, second: Pokemon | undefined, moveFirst: SelectedMove | null, moveSecond: SelectedMove | null;
    let isFirstPokemon1: boolean;

    if (prio1 > prio2) {
      first = this.pokemon1(); second = this.pokemon2();
      moveFirst = this.selectedMove1; moveSecond = this.selectedMove2;
      isFirstPokemon1 = true;
    } else if (prio2 > prio1) {
      first = this.pokemon2(); second = this.pokemon1();
      moveFirst = this.selectedMove2; moveSecond = this.selectedMove1;
      isFirstPokemon1 = false;
    } else {
      // Se priorità uguale, decide la velocità
      const speed1 = this.getSpeed100(this.pokemon1());
      const speed2 = this.getSpeed100(this.pokemon2());
      if (speed1 >= speed2) {
        first = this.pokemon1(); second = this.pokemon2();
        moveFirst = this.selectedMove1; moveSecond = this.selectedMove2;
        isFirstPokemon1 = true;
      } else {
        first = this.pokemon2(); second = this.pokemon1();
        moveFirst = this.selectedMove2; moveSecond = this.selectedMove1;
        isFirstPokemon1 = false;
      }
    }

    // Primo attacco
    const firstCanAct = this.canAct(first);
    let hpSecond = (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp)();
    let hpFirst = (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp)();

    if (firstCanAct.canAct) {
      this.addLog(`${first?.name} used ${moveFirst?.name}!`, 'action');
      // Animazione attacco primo
      if (isFirstPokemon1) {
        this.pokemon1Attacking.set(true);
      } else {
        this.pokemon2Attacking.set(true);
      }
      setTimeout(() => {
        if (isFirstPokemon1) {
          this.pokemon1Attacking.set(false);
        } else {
          this.pokemon2Attacking.set(false);
        }
      }, 350);

      // Controlla se la mossa colpisce
      if (this.moveHits(moveFirst!, first, second)) {
        // Gestione speciale per Rest
        if (moveFirst?.name?.toLowerCase() === 'rest') {
          // Cura completamente e addormenta il Pokémon che la usa
          const healSignal = isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp;
          const maxHp = this.getHpBaseStat(first);
          const beforeHeal = healSignal();
          healSignal.set(maxHp);
          this.addLog(`${first?.name} used Rest and restored all HP!`, 'effect');
          // Addormenta
          const statusSignal = isFirstPokemon1 ? this.pokemon1Status : this.pokemon2Status;
          const sleepTurnsSignal = isFirstPokemon1 ? this.pokemon1SleepTurns : this.pokemon2SleepTurns;
          statusSignal.set('sleep');
          sleepTurnsSignal.set(0);
          this.addLog(`${first?.name} fell asleep!`, 'status');
        } else {
          // Calcola efficacia tipo prima del danno
          const typeMultiplier = this.battleService.calculateTypeModifier(moveFirst?.type?.name ?? '', second!.types.map(t => t.type.name));
          if (typeMultiplier === 0) {
            this.addLog(`It doesn't affect ${second?.name}...`, 'effect');
          } else {
            // Calcola e applica danno
            const damage = this.calculateCustomDamage(first, second, moveFirst!);
            const oldHp = hpSecond;
            hpSecond -= damage;
            hpSecond = Math.max(0, hpSecond);
            (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp).set(hpSecond);

            // Log del danno
            if (damage > 0) {
              this.addLog(`${second?.name} lost ${damage} HP!`, 'damage');
              if (typeMultiplier > 1) {
                this.addLog(`It's super effective!`, 'effect');
              } else if (typeMultiplier < 1 && typeMultiplier > 0) {
                this.addLog(`It's not very effective...`, 'effect');
              }
            }
            // Healing moves
            if (moveFirst?.meta?.healing && moveFirst.meta.healing > 0) {
              // Target: di solito self, ma controlla getMoveTarget
              const healTarget = this.getMoveTarget(moveFirst) === 'self' ? first : second;
              const healSignal = this.getMoveTarget(moveFirst) === 'self'
                ? (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp)
                : (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp);
              const maxHp = this.getHpBaseStat(healTarget);
              const healAmount = Math.floor(maxHp * (moveFirst.meta.healing / 100));
              const beforeHeal = healSignal();
              const afterHeal = Math.min(beforeHeal + healAmount, maxHp);
              healSignal.set(afterHeal);
              this.addLog(`${healTarget?.name} restored ${afterHeal - beforeHeal} HP!`, 'effect');
            }
          }
        }

        // Applica effetti della mossa (stat changes e status)
        this.applyStatChanges(moveFirst!, first, second);
        this.applyStatusCondition(moveFirst!, first, second);
      } else {
        this.addLog(`${first?.name}'s attack missed!`, 'effect');
      }
    } else if (firstCanAct.damage > 0) {
      // Danno da confusione a se stesso
      this.addLog(`${first?.name} is confused and hurt itself!`, 'status');
      hpFirst -= firstCanAct.damage;
      hpFirst = Math.max(0, hpFirst);
      (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp).set(hpFirst);
      this.addLog(`${first?.name} lost ${firstCanAct.damage} HP in confusion!`, 'damage');
    }

    // Controlla KO dopo primo attacco
    if (hpSecond <= 0 || hpFirst <= 0) {
      this.applyEndTurnDamage();
      this.checkVictoryAndReset();
      return;
    }

    // Timeout tra il primo e il secondo attacco
    setTimeout(() => {
      const secondCanAct = this.canAct(second);
      let currentHpFirst = (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp)();
      let currentHpSecond = (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp)();

      if (secondCanAct.canAct) {
        this.addLog(`${second?.name} used ${moveSecond?.name}!`, 'action');
        // Animazione attacco secondo
        if (isFirstPokemon1) {
          this.pokemon2Attacking.set(true);
        } else {
          this.pokemon1Attacking.set(true);
        }
        setTimeout(() => {
          if (isFirstPokemon1) {
            this.pokemon2Attacking.set(false);
          } else {
            this.pokemon1Attacking.set(false);
          }
        }, 350);

        // Controlla se la mossa colpisce
        if (this.moveHits(moveSecond!, second, first)) {
          // Gestione speciale per Rest
          if (moveSecond?.name?.toLowerCase() === 'rest') {
            const healSignal = isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp;
            const maxHp = this.getHpBaseStat(second);
            const beforeHeal = healSignal();
            healSignal.set(maxHp);
            this.addLog(`${second?.name} used Rest and restored all HP!`, 'effect');
            // Addormenta
            const statusSignal = isFirstPokemon1 ? this.pokemon2Status : this.pokemon1Status;
            const sleepTurnsSignal = isFirstPokemon1 ? this.pokemon2SleepTurns : this.pokemon1SleepTurns;
            statusSignal.set('sleep');
            sleepTurnsSignal.set(0);
            this.addLog(`${second?.name} fell asleep!`, 'status');
          } else {
            // Calcola efficacia tipo prima del danno
            const typeMultiplier = this.battleService.calculateTypeModifier(moveSecond?.type?.name ?? '', first!.types.map(t => t.type.name));
            if (typeMultiplier === 0) {
              this.addLog(`It doesn't affect ${first?.name}...`, 'effect');
            } else {
              const damage = this.calculateCustomDamage(second, first, moveSecond!);
              currentHpFirst -= damage;
              currentHpFirst = Math.max(0, currentHpFirst);
              (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp).set(currentHpFirst);

              // Log del danno
              if (damage > 0) {
                this.addLog(`${first?.name} lost ${damage} HP!`, 'damage');
                if (typeMultiplier > 1) {
                  this.addLog(`It's super effective!`, 'effect');
                } else if (typeMultiplier < 1 && typeMultiplier > 0) {
                  this.addLog(`It's not very effective...`, 'effect');
                }
              }
              // Healing moves
              if (moveSecond?.meta?.healing && moveSecond.meta.healing > 0) {
                const healTarget = this.getMoveTarget(moveSecond) === 'self' ? second : first;
                const healSignal = this.getMoveTarget(moveSecond) === 'self'
                  ? (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp)
                  : (isFirstPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp);
                const maxHp = this.getHpBaseStat(healTarget);
                const healAmount = Math.floor(maxHp * (moveSecond.meta.healing / 100));
                const beforeHeal = healSignal();
                const afterHeal = Math.min(beforeHeal + healAmount, maxHp);
                healSignal.set(afterHeal);
                this.addLog(`${healTarget?.name} restored ${afterHeal - beforeHeal} HP!`, 'effect');
              }
            }
          }

          // Applica effetti della mossa
          this.applyStatChanges(moveSecond!, second, first);
          this.applyStatusCondition(moveSecond!, second, first);
        } else {
          this.addLog(`${second?.name}'s attack missed!`, 'effect');
        }
      } else if (secondCanAct.damage > 0) {
        // Danno da confusione
        this.addLog(`${second?.name} is confused and hurt itself!`, 'status');
        currentHpSecond -= secondCanAct.damage;
        currentHpSecond = Math.max(0, currentHpSecond);
        (isFirstPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp).set(currentHpSecond);
        this.addLog(`${second?.name} lost ${secondCanAct.damage} HP in confusion!`, 'damage');
      }

      // Applica danni da status a fine turno
      this.applyEndTurnDamage();

      // Mostra modale vittoria se un Pokémon va KO
      this.checkVictoryAndReset();
    }, 700);
  }

  // Applica danni da status a fine turno per entrambi i Pokémon
  private applyEndTurnDamage() {
    let hp1 = this.pokemon1CurrentHp();
    let hp2 = this.pokemon2CurrentHp();

    hp1 -= this.applyEndTurnStatusDamage(this.pokemon1());
    hp2 -= this.applyEndTurnStatusDamage(this.pokemon2());

    this.pokemon1CurrentHp.set(Math.max(0, hp1));
    this.pokemon2CurrentHp.set(Math.max(0, hp2));
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