import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { forkJoin } from 'rxjs';

// ─── Core ───────────────────────────────────────────────────────────────────
import { Pokemon, MoveReference } from '../../core/models/pokemon.model';
import { SelectedMove } from '../../core/models/move.model';
import { BattleLogEntry } from '../../core/models/battle.model';
import { PokemonApiService } from '../../core/services/pokemon-api.service';
import { MoveApiService } from '../../core/services/move-api.service';
import { BattleEngineService } from '../../core/services/battle-engine.service';
import { calculateMaxHp, getHpPercentage, getHpBarColorClass } from '../../core/utils/hp.utils';
import { calculateEffectiveSpeed, getBaseStat } from '../../core/utils/stat-calculator.utils';
import { STATUS_ABBREVIATIONS } from '../../core/constants/status.constant';

// ─── Shared Components ──────────────────────────────────────────────────────
import { BattleLogComponent } from '../../shared/components/battle-log/battle-log.component';
import { PokemonCardComponent } from '../../shared/components/pokemon-card/pokemon-card.component';

// ─── Helpers ────────────────────────────────────────────────────────────────
import { determineTurnOrder } from './helpers/turn-resolver.helper';
import { checkCanAct, tryApplyStatusCondition, calculateEndTurnStatusDamage } from './helpers/status-effect.helper';
import { selectRandomMoves, processStatChanges, getMoveTarget, checkMoveHits } from './helpers/move-handler.helper';

@Component({
  selector: 'app-battle-page',
  standalone: true,
  imports: [CommonModule, HttpClientModule, PokemonCardComponent, BattleLogComponent],
  templateUrl: './battle-page.component.html',
  styleUrls: ['./battle-page.component.scss'],
})
export class BattlePageComponent {

  // ─── Pokémon State ──────────────────────────────────────────────────────
  pokemon1 = signal<Pokemon | undefined>(undefined);
  pokemon2 = signal<Pokemon | undefined>(undefined);
  isLoading = signal(false);

  pokemon1CurrentHp = signal(0);
  pokemon2CurrentHp = signal(0);

  pokemon1Moves = signal<SelectedMove[]>([]);
  pokemon2Moves = signal<SelectedMove[]>([]);

  pokemon1MovePP = signal<Record<string, number>>({});
  pokemon2MovePP = signal<Record<string, number>>({});

  // ─── Stat Stages (−6 to +6) ────────────────────────────────────────────
  pokemon1StatChanges = signal<Record<string, number>>({});
  pokemon2StatChanges = signal<Record<string, number>>({});

  // ─── Status Conditions ─────────────────────────────────────────────────
  pokemon1Status = signal<string | null>(null);
  pokemon2Status = signal<string | null>(null);
  pokemon1SleepTurns = signal(0);
  pokemon2SleepTurns = signal(0);
  pokemon1ConfusionTurns = signal(0);
  pokemon2ConfusionTurns = signal(0);

  // ─── Attack Animation ──────────────────────────────────────────────────
  pokemon1Attacking = signal(false);
  pokemon2Attacking = signal(false);

  // ─── Battle Log ────────────────────────────────────────────────────────
  battleLogs = signal<BattleLogEntry[]>([]);

  // ─── Modal State ───────────────────────────────────────────────────────
  showModal = signal(false);
  modalPokemon = signal<Pokemon | undefined>(undefined);
  modalPokemonStats = signal<Record<string, number>>({});

  // ─── Victory Modal ─────────────────────────────────────────────────────
  showVictoryModal = signal(false);
  victorySprite: string | null = null;
  victoryText = '';

  // ─── Turn State ────────────────────────────────────────────────────────
  turnState = signal<'choose1' | 'choose2' | 'resolve'>('choose1');
  selectedMove1: SelectedMove | null = null;
  selectedMove2: SelectedMove | null = null;

  constructor(
    private readonly pokemonApi: PokemonApiService,
    private readonly moveApi: MoveApiService,
    private readonly battleEngine: BattleEngineService,
  ) {}

  ngOnInit(): void {
    this.startNewBattle();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Battle Setup
  // ═══════════════════════════════════════════════════════════════════════

  startNewBattle(): void {
    this.isLoading.set(true);
    this.battleLogs.set([]);

    forkJoin([
      this.pokemonApi.getRandomPokemon(),
      this.pokemonApi.getRandomPokemon(),
    ]).subscribe({
      next: ([poke1, poke2]) => {
        this.initializeBattleState(poke1, poke2);
        this.loadPokemonMoves(poke1, this.pokemon1Moves, this.pokemon1MovePP);
        this.loadPokemonMoves(poke2, this.pokemon2Moves, this.pokemon2MovePP);
        this.addLog(`A wild battle begins!`, 'info');
        this.addLog(`${poke1.name} vs ${poke2.name}!`, 'info');
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load Pokémon:', err);
        this.pokemon1.set(undefined);
        this.pokemon2.set(undefined);
        this.isLoading.set(false);
      },
    });
  }

  private initializeBattleState(poke1: Pokemon, poke2: Pokemon): void {
    this.pokemon1.set(poke1);
    this.pokemon2.set(poke2);
    this.pokemon1CurrentHp.set(calculateMaxHp(poke1));
    this.pokemon2CurrentHp.set(calculateMaxHp(poke2));
    this.pokemon1StatChanges.set({});
    this.pokemon2StatChanges.set({});
    this.pokemon1Status.set(null);
    this.pokemon2Status.set(null);
    this.pokemon1SleepTurns.set(0);
    this.pokemon2SleepTurns.set(0);
    this.pokemon1ConfusionTurns.set(0);
    this.pokemon2ConfusionTurns.set(0);
    this.turnState.set('choose1');
    this.selectedMove1 = null;
    this.selectedMove2 = null;
    this.showVictoryModal.set(false);
  }

  private loadPokemonMoves(
    pokemon: Pokemon,
    movesSignal: ReturnType<typeof signal<SelectedMove[]>>,
    ppSignal: ReturnType<typeof signal<Record<string, number>>>,
  ): void {
    const moveRefs = selectRandomMoves(pokemon, 4);
    this.moveApi.fetchMovesDetails(moveRefs).subscribe({
      next: (enriched: SelectedMove[]) => {
        movesSignal.set(enriched);
        const pp: Record<string, number> = {};
        for (const m of enriched) pp[m.name] = m.pp ?? 0;
        ppSignal.set(pp);
      },
      error: () => {
        movesSignal.set(moveRefs.map(m => ({ name: m.name } as SelectedMove)));
        ppSignal.set({});
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Move Selection
  // ═══════════════════════════════════════════════════════════════════════

  onSelectMove1(move: SelectedMove): void {
    if (!this.deductPP(move, this.pokemon1MovePP)) return;
    this.selectedMove1 = move;
    this.addLog(`${this.pokemon1()?.name} selected ${move.name}!`, 'action');
    this.turnState.set('choose2');
  }

  onSelectMove2(move: SelectedMove): void {
    if (!this.deductPP(move, this.pokemon2MovePP)) return;
    this.selectedMove2 = move;
    this.addLog(`${this.pokemon2()?.name} selected ${move.name}!`, 'action');
    this.turnState.set('resolve');
    this.resolveTurn();
  }

  private deductPP(
    move: SelectedMove,
    ppSignal: ReturnType<typeof signal<Record<string, number>>>,
  ): boolean {
    const ppObj = { ...ppSignal() };
    if ((ppObj[move.name] ?? 0) <= 0) return false;
    ppObj[move.name]--;
    ppSignal.set(ppObj);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Turn Resolution
  // ═══════════════════════════════════════════════════════════════════════

  private resolveTurn(): void {
    const p1 = this.pokemon1()!;
    const p2 = this.pokemon2()!;

    const order = determineTurnOrder(
      p1, p2,
      this.selectedMove1!, this.selectedMove2!,
      this.pokemon1StatChanges(), this.pokemon2StatChanges(),
      this.pokemon1Status(), this.pokemon2Status(),
    );

    // Execute first attack
    this.executeAttack(
      order.first.pokemon, order.second.pokemon,
      order.first.move, order.first.isPokemon1,
    );

    // Check KO after first attack
    if (this.pokemon1CurrentHp() <= 0 || this.pokemon2CurrentHp() <= 0) {
      this.applyEndOfTurnDamage();
      this.checkVictory();
      return;
    }

    // Delayed second attack (for animation)
    setTimeout(() => {
      this.executeAttack(
        order.second.pokemon, order.first.pokemon,
        order.second.move, order.second.isPokemon1,
      );
      this.applyEndOfTurnDamage();
      this.checkVictory();
    }, 700);
  }

  private executeAttack(
    attacker: Pokemon,
    defender: Pokemon,
    move: SelectedMove,
    isAttackerPokemon1: boolean,
  ): void {
    const attackerStatus = isAttackerPokemon1 ? this.pokemon1Status() : this.pokemon2Status();

    // ─── Check if attacker can act ────────────────────────────────────
    const actResult = checkCanAct({
      pokemonName: attacker.name,
      status: attackerStatus,
      sleepTurns: isAttackerPokemon1 ? this.pokemon1SleepTurns() : this.pokemon2SleepTurns(),
      confusionTurns: isAttackerPokemon1 ? this.pokemon1ConfusionTurns() : this.pokemon2ConfusionTurns(),
      attackBaseStat: getBaseStat(attacker, 'attack'),
      defenseBaseStat: getBaseStat(attacker, 'defense'),
    });

    // Apply status updates
    actResult.logs.forEach(log => this.battleLogs.update(logs => [...logs, log]));
    this.applyCanActUpdates(isAttackerPokemon1, actResult);

    if (!actResult.canAct) {
      if (actResult.selfDamage > 0) {
        this.addLog(`${attacker.name} is confused and hurt itself!`, 'status');
        const hpSignal = isAttackerPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp;
        hpSignal.set(Math.max(0, hpSignal() - actResult.selfDamage));
        this.addLog(`${attacker.name} lost ${actResult.selfDamage} HP in confusion!`, 'damage');
      }
      return;
    }

    // ─── Trigger attack animation ─────────────────────────────────────
    this.addLog(`${attacker.name} used ${move.name}!`, 'action');
    const atkAnim = isAttackerPokemon1 ? this.pokemon1Attacking : this.pokemon2Attacking;
    atkAnim.set(true);
    setTimeout(() => atkAnim.set(false), 350);

    // ─── Check accuracy ───────────────────────────────────────────────
    const atkStages = isAttackerPokemon1 ? this.pokemon1StatChanges() : this.pokemon2StatChanges();
    const defStages = isAttackerPokemon1 ? this.pokemon2StatChanges() : this.pokemon1StatChanges();

    if (!checkMoveHits(move, atkStages['accuracy'] ?? 0, defStages['evasion'] ?? 0)) {
      this.addLog(`${attacker.name}'s attack missed!`, 'effect');
      return;
    }

    // ─── Special case: Rest ───────────────────────────────────────────
    if (move.name?.toLowerCase() === 'rest') {
      this.handleRestMove(attacker, isAttackerPokemon1);
      return;
    }

    // ─── Calculate and apply damage ───────────────────────────────────
    const typeMultiplier = this.battleEngine.calculateTypeModifier(
      move.type?.name ?? '',
      defender.types.map(t => t.type.name),
    );

    if (typeMultiplier === 0) {
      this.addLog(`It doesn't affect ${defender.name}...`, 'effect');
    } else {
      const damage = this.battleEngine.calculateDamage({
        attacker, defender, move,
        attackerStatChanges: atkStages,
        defenderStatChanges: defStages,
        attackerStatus,
      });

      const defHpSignal = isAttackerPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp;
      defHpSignal.set(Math.max(0, defHpSignal() - damage));

      if (damage > 0) {
        this.addLog(`${defender.name} lost ${damage} HP!`, 'damage');
        this.logTypeEffectiveness(typeMultiplier);
      }

      this.handleHealingEffect(move, attacker, defender, isAttackerPokemon1);
    }

    // ─── Apply secondary effects ──────────────────────────────────────
    this.applyStatChangeEffects(move, attacker, defender, isAttackerPokemon1);
    this.applyStatusEffect(move, attacker, defender, isAttackerPokemon1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Effect Application Helpers
  // ═══════════════════════════════════════════════════════════════════════

  private handleRestMove(user: Pokemon, isUserPokemon1: boolean): void {
    const hpSignal = isUserPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp;
    const maxHp = calculateMaxHp(user);
    hpSignal.set(maxHp);
    this.addLog(`${user.name} used Rest and restored all HP!`, 'effect');

    const statusSignal = isUserPokemon1 ? this.pokemon1Status : this.pokemon2Status;
    const sleepSignal = isUserPokemon1 ? this.pokemon1SleepTurns : this.pokemon2SleepTurns;
    statusSignal.set('sleep');
    sleepSignal.set(0);
    this.addLog(`${user.name} fell asleep!`, 'status');
  }

  private handleHealingEffect(
    move: SelectedMove,
    attacker: Pokemon,
    defender: Pokemon,
    isAttackerPokemon1: boolean,
  ): void {
    if (!move.meta?.healing || move.meta.healing <= 0) return;

    const healsUser = getMoveTarget(move) === 'self';
    const healTarget = healsUser ? attacker : defender;
    const healSignal = healsUser
      ? (isAttackerPokemon1 ? this.pokemon1CurrentHp : this.pokemon2CurrentHp)
      : (isAttackerPokemon1 ? this.pokemon2CurrentHp : this.pokemon1CurrentHp);

    const maxHp = calculateMaxHp(healTarget);
    const healAmount = Math.floor(maxHp * (move.meta.healing / 100));
    const before = healSignal();
    const after = Math.min(before + healAmount, maxHp);
    healSignal.set(after);
    this.addLog(`${healTarget.name} restored ${after - before} HP!`, 'effect');
  }

  private applyStatChangeEffects(
    move: SelectedMove,
    attacker: Pokemon,
    defender: Pokemon,
    isAttackerPokemon1: boolean,
  ): void {
    const atkStages = isAttackerPokemon1 ? this.pokemon1StatChanges() : this.pokemon2StatChanges();
    const defStages = isAttackerPokemon1 ? this.pokemon2StatChanges() : this.pokemon1StatChanges();

    const results = processStatChanges(move, attacker.name, defender.name, atkStages, defStages);

    for (const result of results) {
      const targetSignal = result.targetIsAttacker
        ? (isAttackerPokemon1 ? this.pokemon1StatChanges : this.pokemon2StatChanges)
        : (isAttackerPokemon1 ? this.pokemon2StatChanges : this.pokemon1StatChanges);

      const current = { ...targetSignal() };
      current[result.statName] = result.newStage;
      targetSignal.set(current);
      this.battleLogs.update(logs => [...logs, result.log]);
    }
  }

  private applyStatusEffect(
    move: SelectedMove,
    attacker: Pokemon,
    defender: Pokemon,
    isAttackerPokemon1: boolean,
  ): void {
    const defenderStatus = isAttackerPokemon1 ? this.pokemon2Status() : this.pokemon1Status();

    const result = tryApplyStatusCondition(move, attacker.name, defender.name, defenderStatus);
    if (!result) return;

    result.logs.forEach(log => this.battleLogs.update(logs => [...logs, log]));

    if (result.targetIsAttacker) {
      // Status applied to user (e.g., Rest)
      const statusSig = isAttackerPokemon1 ? this.pokemon1Status : this.pokemon2Status;
      statusSig.set(result.status);
      if (result.sleepTurns !== undefined) {
        (isAttackerPokemon1 ? this.pokemon1SleepTurns : this.pokemon2SleepTurns).set(result.sleepTurns);
      }
    } else {
      // Status applied to defender
      const statusSig = isAttackerPokemon1 ? this.pokemon2Status : this.pokemon1Status;
      if (result.status === 'confusion') {
        (isAttackerPokemon1 ? this.pokemon2ConfusionTurns : this.pokemon1ConfusionTurns)
          .set(result.confusionTurns ?? 0);
      } else {
        statusSig.set(result.status);
        if (result.sleepTurns !== undefined) {
          (isAttackerPokemon1 ? this.pokemon2SleepTurns : this.pokemon1SleepTurns).set(result.sleepTurns);
        }
      }
    }
  }

  private applyCanActUpdates(isPokemon1: boolean, result: ReturnType<typeof checkCanAct>): void {
    if (isPokemon1) {
      this.pokemon1SleepTurns.set(result.newSleepTurns);
      this.pokemon1ConfusionTurns.set(result.newConfusionTurns);
      if (result.statusCleared) this.pokemon1Status.set(null);
    } else {
      this.pokemon2SleepTurns.set(result.newSleepTurns);
      this.pokemon2ConfusionTurns.set(result.newConfusionTurns);
      if (result.statusCleared) this.pokemon2Status.set(null);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // End of Turn
  // ═══════════════════════════════════════════════════════════════════════

  private applyEndOfTurnDamage(): void {
    const dmg1 = calculateEndTurnStatusDamage(this.pokemon1Status(), calculateMaxHp(this.pokemon1()!));
    const dmg2 = calculateEndTurnStatusDamage(this.pokemon2Status(), calculateMaxHp(this.pokemon2()!));
    if (dmg1 > 0) this.pokemon1CurrentHp.set(Math.max(0, this.pokemon1CurrentHp() - dmg1));
    if (dmg2 > 0) this.pokemon2CurrentHp.set(Math.max(0, this.pokemon2CurrentHp() - dmg2));
  }

  private checkVictory(): void {
    if (this.pokemon1CurrentHp() <= 0) {
      this.victorySprite = this.getShowdownFront(this.pokemon2()) ?? this.pokemon2()?.sprites?.front_default ?? null;
      this.victoryText = `${this.pokemon2()?.name} vince!`;
      this.showVictoryModal.set(true);
    } else if (this.pokemon2CurrentHp() <= 0) {
      this.victorySprite = this.getShowdownFront(this.pokemon1()) ?? this.pokemon1()?.sprites?.front_default ?? null;
      this.victoryText = `${this.pokemon1()?.name} vince!`;
      this.showVictoryModal.set(true);
    }
    this.selectedMove1 = null;
    this.selectedMove2 = null;
    this.turnState.set('choose1');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI Helpers (used in template)
  // ═══════════════════════════════════════════════════════════════════════

  getShowdownFront(pokemon: Pokemon | undefined): string | null {
    return pokemon?.sprites?.other?.showdown?.front_default || null;
  }

  getShowdownBack(pokemon: Pokemon | undefined): string | null {
    return pokemon?.sprites?.other?.showdown?.back_default || null;
  }

  getHpBaseStat(pokemon: Pokemon | undefined): number {
    return pokemon ? calculateMaxHp(pokemon) : 0;
  }

  getHpPercentage(currentHp: number, pokemon: Pokemon | undefined): number {
    if (!pokemon) return 0;
    return getHpPercentage(currentHp, calculateMaxHp(pokemon));
  }

  getHpBarClass(percentage: number): string {
    return getHpBarColorClass(percentage);
  }

  getStatusAbbreviation(status: string | null): string {
    if (!status) return '';
    return STATUS_ABBREVIATIONS[status] ?? status.toUpperCase();
  }

  // ─── Modal ────────────────────────────────────────────────────────────

  openModal(pokemon: Pokemon): void {
    this.modalPokemon.set(pokemon);
    this.modalPokemonStats.set(
      pokemon === this.pokemon1() ? this.pokemon1StatChanges() : this.pokemon2StatChanges(),
    );
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.modalPokemon.set(undefined);
  }

  // ─── Logging ──────────────────────────────────────────────────────────

  private addLog(message: string, type: BattleLogEntry['type'] = 'info'): void {
    this.battleLogs.update(logs => [...logs, { message, type, timestamp: Date.now() }]);
  }

  private logTypeEffectiveness(modifier: number): void {
    if (modifier > 1) this.addLog(`It's super effective!`, 'effect');
    else if (modifier < 1 && modifier > 0) this.addLog(`It's not very effective...`, 'effect');
  }
}
