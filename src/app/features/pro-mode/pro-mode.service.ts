import { Injectable, computed, effect, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { createClient } from '@supabase/supabase-js';

import { Pokemon } from '../../core/models/pokemon.model';
import { SelectedMove } from '../../core/models/move.model';
import { PokemonApiService } from '../../core/services/pokemon-api.service';
import { MoveApiService } from '../../core/services/move-api.service';
import { AuthService } from '../../core/services/auth.service';
import { BattleEngineService } from '../../core/services/battle-engine.service';
import { calculateBst, getBaseStat, getStatStageModifier } from '../../core/utils/stat-calculator.utils';
import { environment } from '../../../environments/environment';
import { analyzeMoveBehavior } from '../battle/helpers/move-effect-classifier.helper';
import { checkCanAct, calculateEndTurnStatusDamage, tryApplyStatusCondition } from '../battle/helpers/status-effect.helper';
import { checkMoveHits, getMoveTarget, processStatChanges } from '../battle/helpers/move-handler.helper';

const MAX_POKEMON_ID = 1025;
const DEFAULT_STARTERS = [1, 4, 7];
const STARTER_LEVEL = 5;
const MAX_LEVEL = 100;

const BATTLE_STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;
type BattleStatName = typeof BATTLE_STATS[number];

type BonusStats = Record<BattleStatName, number>;

export interface BattleStatView {
  key: BattleStatName;
  label: string;
  value: number;
  baseValue: number;
  stage: number;
  bonus: number;
}

interface ProRunPokemon {
  pokemon: Pokemon;
  level: number;
  currentHp: number;
  maxHp: number;
  bonusStats: BonusStats;
  moves: SelectedMove[];
  bst: number;
  status: string | null;
  sleepTurns: number;
  confusionTurns: number;
  statChanges: Record<string, number>;
  protected: boolean;
  mustRecharge: boolean;
  pendingChargeMove: SelectedMove | null;
  trapTurns: number;
  trapResidualFraction: number | null;
  seededByOpponent: boolean;
}

interface ProRunSnapshot {
  runActive: boolean;
  runWon: boolean;
  awaitingRunEndContinue: boolean;
  currentStage: number;
  pendingStatPoints: number;
  waitingStatAllocation: boolean;
  transitioningToLevelUp: boolean;
  playerAttacking: boolean;
  enemyAttacking: boolean;
  player: ProRunPokemon | null;
  enemy: ProRunPokemon | null;
  statDraftDelta: BonusStats;
  randomLevelUpDelta: BonusStats;
  pendingNewMove: SelectedMove | null;
  showSkipMoveConfirm: boolean;
  battleLog: string[];
}

export interface StarterCatalogEntry {
  id: number;
  name: string;
  spriteUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ProModeService {
  private readonly supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  private readonly runStorageKey = 'pokemon-battle.pro-mode.run.v1';
  private readonly runSnapshotTable = 'pro_run_snapshots';
  private runSnapshotHydrating = false;
  private runSnapshotReady = false;
  private pendingRunSnapshot: ProRunSnapshot | null = null;
  private runSnapshotSaveTimer: ReturnType<typeof setTimeout> | null = null;

  isLoading = signal(false);
  error = signal<string | null>(null);

  points = signal(0);
  unlockedStarterIds = signal<number[]>([...DEFAULT_STARTERS]);
  unlockedStarters = signal<Pokemon[]>([]);
  starterCatalog = signal<StarterCatalogEntry[]>([]);
  private unlockCostCache = signal<Record<number, number>>({});

  runActive = signal(false);
  runWon = signal(false);
  awaitingRunEndContinue = signal(false);
  currentStage = signal(0);
  pendingStatPoints = signal(0);
  waitingStatAllocation = signal(false);
  transitioningToLevelUp = signal(false);

  playerAttacking = signal(false);
  enemyAttacking = signal(false);

  player = signal<ProRunPokemon | null>(null);
  enemy = signal<ProRunPokemon | null>(null);

  statDraftDelta = signal<BonusStats>(this.createEmptyBonusStats());
  randomLevelUpDelta = signal<BonusStats>(this.createEmptyBonusStats());
  pendingNewMove = signal<SelectedMove | null>(null);
  showSkipMoveConfirm = signal(false);

  shinyStarterIds = signal<number[]>([]);

  battleLog = signal<string[]>([]);

  unlockCandidate = signal<Pokemon | null>(null);
  unlockCandidateCost = signal(0);

  showResumeRunPrompt = signal(false);
  resumeRunPromptStage = signal<number | null>(null);
  resumeRunPromptPokemonName = signal('');

  readonly canStart = computed(() => !this.runActive() && !this.isLoading());
  readonly progressPercent = computed(() => {
    if (!this.currentStage()) return 0;
    return Math.floor((this.currentStage() / MAX_LEVEL) * 100);
  });

  constructor(
    private readonly auth: AuthService,
    private readonly pokemonApi: PokemonApiService,
    private readonly moveApi: MoveApiService,
    private readonly battleEngine: BattleEngineService,
  ) {
    this.setupRunPersistenceEffect();
  }

  async initialize(): Promise<void> {
    this.error.set(null);
    this.isLoading.set(true);
    try {
      await this.loadProgress();
      await this.loadUnlockedStarters();
      await this.loadStarterCatalog();
      await this.loadShinyStarters();
    } catch (err) {
      this.error.set(this.toErrorMessage(err, 'Errore inizializzazione modalità pro.'));
    } finally {
      await this.restoreRunSnapshot();
      this.runSnapshotReady = true;
      this.isLoading.set(false);
    }
  }

  isStarterUnlocked(id: number): boolean {
    return this.unlockedStarterIds().includes(id);
  }

  getCachedUnlockCost(id: number): number | null {
    const cache = this.unlockCostCache();
    return cache[id] ?? null;
  }

  async prepareUnlockCandidateById(id: number): Promise<void> {
    this.error.set(null);
    this.unlockCandidate.set(null);
    this.unlockCandidateCost.set(0);

    if (!Number.isInteger(id) || id <= 0) return;
    if (this.unlockedStarterIds().includes(id)) return;

    this.isLoading.set(true);
    try {
      const pokemon = await firstValueFrom(this.pokemonApi.getPokemonById(id));
      const bst = calculateBst(pokemon);
      const cost = this.getUnlockCost(bst);

      this.unlockCandidate.set(pokemon);
      this.unlockCandidateCost.set(cost);
      this.unlockCostCache.update(cache => ({ ...cache, [id]: cost }));
    } catch (err) {
      this.error.set(this.toErrorMessage(err, 'Impossibile caricare i dati del Pokémon da sbloccare.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async startRun(starterId: number): Promise<void> {
    this.error.set(null);
    this.showResumeRunPrompt.set(false);
    this.resumeRunPromptStage.set(null);
    this.resumeRunPromptPokemonName.set('');
    this.pendingRunSnapshot = null;
    this.runWon.set(false);
    this.awaitingRunEndContinue.set(false);
    this.isLoading.set(true);
    try {
      const starterRaw = await firstValueFrom(this.pokemonApi.getPokemonById(starterId));
      const starter = this.applyUserShinyIfOwned(starterRaw);
      const bonusStats = this.createEmptyBonusStats();
      const moves = await this.getMovesForLevel(starter, STARTER_LEVEL, false);
      const maxHp = this.calculateStatValue(starter, 'hp', STARTER_LEVEL, bonusStats);

      this.player.set({
        pokemon: starter,
        level: STARTER_LEVEL,
        currentHp: maxHp,
        maxHp,
        bonusStats,
        moves,
        bst: calculateBst(starter),
        status: null,
        sleepTurns: 0,
        confusionTurns: 0,
        statChanges: {},
        protected: false,
        mustRecharge: false,
        pendingChargeMove: null,
        trapTurns: 0,
        trapResidualFraction: null,
        seededByOpponent: false,
      });

      this.currentStage.set(1);
      this.pendingStatPoints.set(0);
      this.waitingStatAllocation.set(false);
      this.transitioningToLevelUp.set(false);
      this.statDraftDelta.set(this.createEmptyBonusStats());
      this.randomLevelUpDelta.set(this.createEmptyBonusStats());
      this.pendingNewMove.set(null);
      this.showSkipMoveConfirm.set(false);
      this.runActive.set(true);
      this.battleLog.set([`Run iniziata con ${starter.name} (Lv ${STARTER_LEVEL})!`]);

      await this.spawnEnemyForCurrentStage();
    } catch (err) {
      this.error.set(this.toErrorMessage(err, 'Impossibile iniziare la run.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async playTurn(playerMoveName: string): Promise<void> {
    if (!this.runActive() || this.waitingStatAllocation() || this.transitioningToLevelUp()) return;
    const player = this.player();
    const enemy = this.enemy();
    if (!player || !enemy) return;

    // Protect dura solo per il turno corrente
    this.player.update(p => (p ? { ...p, protected: false } : p));
    this.enemy.update(p => (p ? { ...p, protected: false } : p));

    const playerMove = player.moves.find(m => m.name === playerMoveName);
    if (!playerMove) return;

    const enemyMove = enemy.moves[Math.floor(Math.random() * enemy.moves.length)];
    if (!enemyMove) return;

    const playerSpeed = this.calculateStatValue(player.pokemon, 'speed', player.level, player.bonusStats);
    const enemySpeed = this.calculateStatValue(enemy.pokemon, 'speed', enemy.level, enemy.bonusStats);
    const playerFirst = playerSpeed >= enemySpeed;

    if (playerFirst) {
      await this.applyAttack(true, playerMove, player, enemy);
      if (this.enemy() && this.enemy()!.currentHp > 0) {
        await this.applyAttack(false, enemyMove, this.enemy()!, this.player()!);
      }
    } else {
      await this.applyAttack(false, enemyMove, enemy, player);
      if (this.player() && this.player()!.currentHp > 0) {
        await this.applyAttack(true, playerMove, this.player()!, this.enemy()!);
      }
    }

    const updatedEnemy = this.enemy();
    const updatedPlayer = this.player();

    if (updatedEnemy && updatedEnemy.currentHp <= 0) {
      await this.sleep(550);
      await this.onEnemyDefeated();
      return;
    }

    this.applyEndOfTurnEffects();

    const endEnemy = this.enemy();
    const endPlayer = this.player();
    if (endEnemy && endEnemy.currentHp <= 0) {
      await this.sleep(2000);
      await this.onEnemyDefeated();
      return;
    }

    if (updatedPlayer && updatedPlayer.currentHp <= 0) {
      this.markRunAsLost(updatedPlayer.pokemon.name);
    }

    if (endPlayer && endPlayer.currentHp <= 0) {
      this.markRunAsLost(endPlayer.pokemon.name);
    }
  }

  continueAfterLoss(): void {
    if (!this.awaitingRunEndContinue()) return;

    this.clearRunSnapshot();

    this.awaitingRunEndContinue.set(false);
    this.runWon.set(false);
    this.runActive.set(false);
    this.currentStage.set(0);
    this.pendingStatPoints.set(0);
    this.waitingStatAllocation.set(false);
    this.transitioningToLevelUp.set(false);
    this.playerAttacking.set(false);
    this.enemyAttacking.set(false);
    this.player.set(null);
    this.enemy.set(null);
    this.statDraftDelta.set(this.createEmptyBonusStats());
    this.randomLevelUpDelta.set(this.createEmptyBonusStats());
    this.pendingNewMove.set(null);
    this.showSkipMoveConfirm.set(false);
  }

  allocateStat(stat: string): void {
    this.addDraftStat(stat);
  }

  addDraftStat(stat: string): void {
    if (!this.waitingStatAllocation() || this.pendingStatPoints() <= 0) return;
    if (!BATTLE_STATS.includes(stat as BattleStatName)) return;
    const safeStat = stat as BattleStatName;
    const draft = { ...this.statDraftDelta() };
    draft[safeStat] += 1;
    this.statDraftDelta.set(draft);
    this.pendingStatPoints.set(this.pendingStatPoints() - 1);
  }

  removeDraftStat(stat: string): void {
    if (!this.waitingStatAllocation()) return;
    if (!BATTLE_STATS.includes(stat as BattleStatName)) return;
    const safeStat = stat as BattleStatName;
    const draft = { ...this.statDraftDelta() };
    if (draft[safeStat] <= 0) return;
    draft[safeStat] -= 1;
    this.statDraftDelta.set(draft);
    this.pendingStatPoints.set(this.pendingStatPoints() + 1);
  }

  async continueAfterLevelUp(): Promise<void> {
    if (!this.waitingStatAllocation()) return;
    if (this.pendingStatPoints() > 0 || !!this.pendingNewMove()) return;

    const player = this.player();
    if (!player) return;

    const draft = this.statDraftDelta();
    const random = this.randomLevelUpDelta();
    const totalLevelDelta = this.mergeBonusStats(draft, random);

    const nextBonus: BonusStats = {
      hp: player.bonusStats.hp + totalLevelDelta.hp,
      attack: player.bonusStats.attack + totalLevelDelta.attack,
      defense: player.bonusStats.defense + totalLevelDelta.defense,
      'special-attack': player.bonusStats['special-attack'] + totalLevelDelta['special-attack'],
      'special-defense': player.bonusStats['special-defense'] + totalLevelDelta['special-defense'],
      speed: player.bonusStats.speed + totalLevelDelta.speed,
    };

    const newMaxHp = this.calculateStatValue(player.pokemon, 'hp', player.level, nextBonus);
    const hpDiff = newMaxHp - player.maxHp;

    this.player.set({
      ...player,
      bonusStats: nextBonus,
      maxHp: newMaxHp,
      currentHp: Math.max(1, Math.min(newMaxHp, player.currentHp + hpDiff)),
    });

    this.waitingStatAllocation.set(false);
    this.statDraftDelta.set(this.createEmptyBonusStats());
    this.randomLevelUpDelta.set(this.createEmptyBonusStats());
    await this.spawnEnemyForCurrentStage();
    await this.forcePersistRunSnapshotNow();
  }

  replaceMoveWithNew(oldMoveName: string): void {
    const newMove = this.pendingNewMove();
    const player = this.player();
    if (!newMove || !player) return;

    const idx = player.moves.findIndex(m => m.name === oldMoveName);
    if (idx < 0) return;

    const nextMoves = [...player.moves];
    nextMoves[idx] = newMove;
    this.player.set({ ...player, moves: nextMoves });
    this.pendingNewMove.set(null);
    this.showSkipMoveConfirm.set(false);
    this.addLog(`${player.pokemon.name} ha dimenticato ${oldMoveName} e imparato ${newMove.name}!`);
  }

  requestSkipNewMove(): void {
    if (!this.pendingNewMove()) return;
    this.showSkipMoveConfirm.set(true);
  }

  cancelSkipNewMove(): void {
    this.showSkipMoveConfirm.set(false);
  }

  confirmSkipNewMove(): void {
    const newMove = this.pendingNewMove();
    const player = this.player();
    if (!newMove || !player) return;
    this.pendingNewMove.set(null);
    this.showSkipMoveConfirm.set(false);
    this.addLog(`${player.pokemon.name} non ha imparato ${newMove.name}.`);
  }

  getRunStats(target: 'player' | 'enemy'): BattleStatView[] {
    const source = target === 'player' ? this.player() : this.enemy();
    if (!source) return [];

    const labels: Record<BattleStatName, string> = {
      hp: 'HP',
      attack: 'Atk',
      defense: 'Def',
      'special-attack': 'SpA',
      'special-defense': 'SpD',
      speed: 'Spe',
    };

    const levelDelta = target === 'player' && this.waitingStatAllocation()
      ? this.mergeBonusStats(this.statDraftDelta(), this.randomLevelUpDelta())
      : this.createEmptyBonusStats();

    return BATTLE_STATS.map((key) => {
      const bonus = source.bonusStats[key] + levelDelta[key];
      const baseValue = this.calculateStatValue(source.pokemon, key, source.level, {
        ...source.bonusStats,
        [key]: bonus,
      });

      const stage = key === 'hp' ? 0 : (source.statChanges[key] ?? 0);
      const value = key === 'hp'
        ? baseValue
        : Math.max(1, Math.floor(baseValue * getStatStageModifier(stage)));

      return {
        key,
        label: labels[key],
        value,
        baseValue,
        stage,
        bonus,
      };
    });
  }

  getPastBonus(stat: string): number {
    if (!BATTLE_STATS.includes(stat as BattleStatName)) return 0;
    const player = this.player();
    if (!player) return 0;
    return player.bonusStats[stat as BattleStatName] ?? 0;
  }

  getCurrentLevelBonus(stat: string): number {
    if (!this.waitingStatAllocation()) return 0;
    if (!BATTLE_STATS.includes(stat as BattleStatName)) return 0;
    const key = stat as BattleStatName;
    return (this.randomLevelUpDelta()[key] ?? 0) + (this.statDraftDelta()[key] ?? 0);
  }

  getCurrentLevelRandomBonus(stat: string): number {
    if (!this.waitingStatAllocation()) return 0;
    if (!BATTLE_STATS.includes(stat as BattleStatName)) return 0;
    const key = stat as BattleStatName;
    return this.randomLevelUpDelta()[key] ?? 0;
  }

  async prepareUnlockCandidate(query: string): Promise<void> {
    this.error.set(null);
    this.unlockCandidate.set(null);
    this.unlockCandidateCost.set(0);

    const value = query.trim().toLowerCase();
    if (!value) return;

    this.isLoading.set(true);
    try {
      const parsedId = Number(value);
      const pokemon = Number.isInteger(parsedId) && parsedId > 0
        ? await firstValueFrom(this.pokemonApi.getPokemonById(parsedId))
        : await firstValueFrom(this.pokemonApi.getPokemonByName(value));

      this.unlockCandidate.set(pokemon);
      this.unlockCandidateCost.set(this.getUnlockCost(calculateBst(pokemon)));
    } catch (err) {
      this.error.set(this.toErrorMessage(err, 'Pokémon non trovato. Usa nome o ID valido.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async unlockCandidatePokemon(): Promise<void> {
    const candidate = this.unlockCandidate();
    if (!candidate) return;

    const id = candidate.id;
    const cost = this.unlockCandidateCost();
    if (this.unlockedStarterIds().includes(id)) {
      this.error.set(`${candidate.name} è già sbloccato.`);
      return;
    }
    if (this.points() < cost) {
      this.error.set(`Punti insufficienti. Servono ${cost}.`);
      return;
    }

    const updatedIds = [...this.unlockedStarterIds(), id].sort((a, b) => a - b);
    this.unlockedStarterIds.set(updatedIds);
    this.points.set(this.points() - cost);
    await this.saveProgress();
    await this.loadUnlockedStarters();
    this.unlockCandidate.set(null);
    this.unlockCandidateCost.set(0);
    this.addLog(`${candidate.name} sbloccato come starter!`);
  }

  getUnlockCostByPokemon(pokemon: Pokemon): number {
    return this.getUnlockCost(calculateBst(pokemon));
  }

  private async onEnemyDefeated(): Promise<void> {
    const stage = this.currentStage();
    this.addLog(`Livello ${stage} completato!`);
    await this.awardMiniBossPointsIfNeeded(stage);

    if (stage >= MAX_LEVEL) {
      this.runActive.set(false);
      this.runWon.set(true);
      this.awaitingRunEndContinue.set(false);
      this.enemy.set(null);
      const reward = this.getRunReward();
      this.points.set(this.points() + reward);
      const winnerId = this.player()?.pokemon.id;
      if (winnerId) {
        await this.awardShinyStarter(winnerId);
      }
      await this.saveProgress();
      this.addLog(`Hai completato la run! +${reward} punti sblocco e starter shiny ottenuto.`);
      return;
    }

    const player = this.player();
    if (!player) return;

    const newLevel = Math.min(MAX_LEVEL, player.level + 1);
    const newMaxHp = this.calculateStatValue(player.pokemon, 'hp', newLevel, player.bonusStats);
    const newMove = await this.getFirstNewLearnableMove(player.pokemon, newLevel, player.moves);

    this.player.set({
      ...player,
      level: newLevel,
      maxHp: newMaxHp,
      currentHp: newMaxHp,
    });

    this.currentStage.set(stage + 1);
    this.randomLevelUpDelta.set(this.distributeRandomPoints(4));
    this.pendingStatPoints.set(3);
    this.waitingStatAllocation.set(false);
    this.statDraftDelta.set(this.createEmptyBonusStats());
    this.enemy.set(null);

    if (newMove) {
      if (player.moves.length < 4) {
        this.player.update(current => {
          if (!current) return current;
          return {
            ...current,
            moves: [...current.moves, newMove],
          };
        });
        this.addLog(`${player.pokemon.name} ha imparato ${newMove.name}!`);
      } else {
        this.pendingNewMove.set(newMove);
        this.addLog(`${player.pokemon.name} vuole imparare ${newMove.name}. Scegli una mossa da sostituire o rifiuta.`);
      }
    } else {
      this.pendingNewMove.set(null);
    }

    this.transitioningToLevelUp.set(true);
    await this.sleep(300);
    this.waitingStatAllocation.set(true);
    this.transitioningToLevelUp.set(false);
    this.addLog(`${player.pokemon.name} è salito al livello ${newLevel}! +4 punti random e scegli altri 3 punti.`);
  }

  private async awardMiniBossPointsIfNeeded(stage: number): Promise<void> {
    if (stage <= 0 || stage % 10 !== 0) return;

    const reward = this.getMiniBossReward(stage);
    this.points.set(this.points() + reward);
    this.addLog(`Mini Boss sconfitto! +${reward} punti.`);

    try {
      await this.saveProgress();
    } catch {
      // Non bloccare la run se il salvataggio punti fallisce.
    }
  }

  private async applyAttack(
    attackerIsPlayer: boolean,
    move: SelectedMove,
    attacker: ProRunPokemon,
    defender: ProRunPokemon,
  ): Promise<void> {
    // Usa sempre lo stato più aggiornato dai signal
    const attackerState = attackerIsPlayer ? this.player() : this.enemy();
    const defenderState = attackerIsPlayer ? this.enemy() : this.player();
    if (!attackerState || !defenderState) return;

    if (attackerState.mustRecharge) {
      this.addLog(`${attackerState.pokemon.name} deve ricaricare e non può muoversi!`);
      this.setRunPokemon(attackerIsPlayer, { ...attackerState, mustRecharge: false });
      return;
    }

    let resolvedMove = move;
    if (attackerState.pendingChargeMove) {
      resolvedMove = attackerState.pendingChargeMove;
      this.setRunPokemon(attackerIsPlayer, { ...attackerState, pendingChargeMove: null });
      this.addLog(`${attackerState.pokemon.name} scatena ${resolvedMove.name}!`);
    }

    const behavior = analyzeMoveBehavior(resolvedMove);
    if (!attackerState.pendingChargeMove && behavior.requiresChargeTurn) {
      this.setRunPokemon(attackerIsPlayer, { ...attackerState, pendingChargeMove: resolvedMove });
      this.addLog(`${attackerState.pokemon.name} sta caricando il colpo!`);
      return;
    }

    const actResult = checkCanAct({
      pokemonName: attackerState.pokemon.name,
      status: attackerState.status,
      sleepTurns: attackerState.sleepTurns,
      confusionTurns: attackerState.confusionTurns,
      attackBaseStat: this.calculateStatValue(attackerState.pokemon, 'attack', attackerState.level, attackerState.bonusStats),
      defenseBaseStat: this.calculateStatValue(attackerState.pokemon, 'defense', attackerState.level, attackerState.bonusStats),
    });

    actResult.logs.forEach(l => this.addLog(l.message));
    this.setRunPokemon(attackerIsPlayer, {
      ...attackerState,
      sleepTurns: actResult.newSleepTurns,
      confusionTurns: actResult.newConfusionTurns,
      status: actResult.statusCleared ? null : attackerState.status,
    });

    if (!actResult.canAct) {
      if (actResult.selfDamage > 0) {
        this.addLog(`${attackerState.pokemon.name} si ferisce da solo per confusione!`);
        this.damagePokemon(attackerIsPlayer, actResult.selfDamage);
      }
      return;
    }

    if (attackerIsPlayer) this.playerAttacking.set(true);
    else this.enemyAttacking.set(true);

    await this.sleep(200);

    this.addLog(`${attackerState.pokemon.name} usa ${resolvedMove.name}!`);

    if (behavior.isProtectLike) {
      this.setRunPokemon(attackerIsPlayer, { ...this.getRunPokemon(attackerIsPlayer)!, protected: true });
      this.addLog(`${attackerState.pokemon.name} è protetto per questo turno!`);
      await this.sleep(180);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    const freshDefender = this.getRunPokemon(!attackerIsPlayer)!;
    if (behavior.isSleepOnly && freshDefender.status !== 'sleep') {
      this.addLog(`${resolvedMove.name} fallisce: il bersaglio non dorme.`);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    if (freshDefender.protected && getMoveTarget(resolvedMove) === 'opponent') {
      this.addLog(`${freshDefender.pokemon.name} si è protetto!`);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    if (!checkMoveHits(resolvedMove, this.getRunPokemon(attackerIsPlayer)!.statChanges['accuracy'] ?? 0, freshDefender.statChanges['evasion'] ?? 0)) {
      this.addLog(`${attackerState.pokemon.name} manca il colpo!`);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    if (resolvedMove.name?.toLowerCase() === 'rest') {
      this.handleRestMove(attackerIsPlayer);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    if (resolvedMove.name?.toLowerCase() === 'transform') {
      const attackerName = this.getRunPokemon(attackerIsPlayer)?.pokemon.name ?? 'Pokémon';
      const defenderName = this.getRunPokemon(!attackerIsPlayer)?.pokemon.name ?? 'bersaglio';
      this.handleTransformMove(attackerIsPlayer);
      this.addLog(`${attackerName} si trasforma in ${defenderName}!`);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    const isStatusMove = resolvedMove.damage_class?.name === 'status';
    const power = resolvedMove.power ?? 0;

    if (isStatusMove || power <= 0) {
      this.addLog(`${attackerState.pokemon.name} usa ${resolvedMove.name}.`);
      this.applySecondaryEffects(attackerIsPlayer, resolvedMove, 0, behavior);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    const currentAttacker = this.getRunPokemon(attackerIsPlayer)!;
    const currentDefender = this.getRunPokemon(!attackerIsPlayer)!;

    const typeMultiplier = this.battleEngine.calculateTypeModifier(
      resolvedMove.type?.name ?? '',
      currentDefender.pokemon.types.map((t) => t.type.name),
    );

    if (typeMultiplier === 0) {
      this.addLog(`Non ha effetto su ${currentDefender.pokemon.name}...`);
      await this.sleep(120);
      if (attackerIsPlayer) this.playerAttacking.set(false);
      else this.enemyAttacking.set(false);
      return;
    }

    const effectiveMove: SelectedMove = behavior.fixedPowerFromHappiness !== null
      ? { ...resolvedMove, power: behavior.fixedPowerFromHappiness }
      : resolvedMove;

    const isSpecial = effectiveMove.damage_class?.name === 'special';
    const atkStatName = isSpecial ? 'special-attack' : 'attack';
    const defStatName = isSpecial ? 'special-defense' : 'defense';

    const atkBase = this.calculateStatValue(
      currentAttacker.pokemon,
      atkStatName,
      currentAttacker.level,
      currentAttacker.bonusStats,
    );
    const defBase = this.calculateStatValue(
      currentDefender.pokemon,
      defStatName,
      currentDefender.level,
      currentDefender.bonusStats,
    );

    const atkStage = getStatStageModifier(currentAttacker.statChanges[atkStatName] ?? 0);
    const defStage = getStatStageModifier(currentDefender.statChanges[defStatName] ?? 0);

    const atk = Math.max(1, Math.floor(atkBase * atkStage));
    const def = Math.max(1, Math.floor(defBase * defStage));

    const stab = currentAttacker.pokemon.types.some((t) => t.type.name === effectiveMove.type?.name) ? 1.5 : 1;
    const burnModifier = currentAttacker.status === 'burn' && !isSpecial ? 0.5 : 1;
    const randomFactor = 0.85 + Math.random() * 0.15;
    const levelFactor = Math.floor((2 * currentAttacker.level) / 5) + 2;
    const baseDamage = (((levelFactor * (effectiveMove.power ?? 0) * (atk / def)) / 50) + 2)
      * stab
      * typeMultiplier
      * burnModifier;
    const damage = Math.max(1, Math.floor(baseDamage * randomFactor));

    this.damagePokemon(!attackerIsPlayer, damage);

    this.addLog(`${currentAttacker.pokemon.name} usa ${resolvedMove.name}: ${damage} danni.`);
    if (typeMultiplier > 1) this.addLog('È superefficace!');
    else if (typeMultiplier < 1) this.addLog('Non è molto efficace...');

    this.applySecondaryEffects(attackerIsPlayer, resolvedMove, damage, behavior);

    if (behavior.requiresRechargeTurn) {
      const latestAttacker = this.getRunPokemon(attackerIsPlayer);
      if (latestAttacker) this.setRunPokemon(attackerIsPlayer, { ...latestAttacker, mustRecharge: true });
      this.addLog(`${currentAttacker.pokemon.name} deve ricaricare al prossimo turno!`);
    }

    await this.sleep(180);
    if (attackerIsPlayer) this.playerAttacking.set(false);
    else this.enemyAttacking.set(false);
  }

  private getRunPokemon(isPlayer: boolean): ProRunPokemon | null {
    return isPlayer ? this.player() : this.enemy();
  }

  private setRunPokemon(isPlayer: boolean, pokemon: ProRunPokemon): void {
    if (isPlayer) this.player.set(pokemon);
    else this.enemy.set(pokemon);
  }

  private damagePokemon(isPlayer: boolean, damage: number): number {
    const target = this.getRunPokemon(isPlayer);
    if (!target || damage <= 0) return 0;
    const applied = Math.min(target.currentHp, Math.max(0, Math.floor(damage)));
    this.setRunPokemon(isPlayer, {
      ...target,
      currentHp: Math.max(0, target.currentHp - applied),
    });
    return applied;
  }

  private healPokemon(isPlayer: boolean, amount: number): number {
    const target = this.getRunPokemon(isPlayer);
    if (!target || amount <= 0) return 0;
    const applied = Math.min(target.maxHp - target.currentHp, Math.max(0, Math.floor(amount)));
    this.setRunPokemon(isPlayer, {
      ...target,
      currentHp: Math.min(target.maxHp, target.currentHp + applied),
    });
    return applied;
  }

  private handleRestMove(attackerIsPlayer: boolean): void {
    const attacker = this.getRunPokemon(attackerIsPlayer);
    if (!attacker) return;

    this.setRunPokemon(attackerIsPlayer, {
      ...attacker,
      currentHp: attacker.maxHp,
      status: 'sleep',
      sleepTurns: 0,
      confusionTurns: 0,
    });
    this.addLog(`${attacker.pokemon.name} si riposa e recupera tutti gli HP!`);
  }

  private handleTransformMove(attackerIsPlayer: boolean): void {
    const attacker = this.getRunPokemon(attackerIsPlayer);
    const defender = this.getRunPokemon(!attackerIsPlayer);
    if (!attacker || !defender) return;

    const copiedMoves = defender.moves.slice(0, 4).map(move => ({ ...move, pp: 5 }));

    this.setRunPokemon(attackerIsPlayer, {
      ...attacker,
      pokemon: { ...defender.pokemon },
      moves: copiedMoves,
      statChanges: { ...defender.statChanges },
    });
  }

  private applySecondaryEffects(
    attackerIsPlayer: boolean,
    move: SelectedMove,
    dealtDamage: number,
    behavior = analyzeMoveBehavior(move),
  ): void {
    const attacker = this.getRunPokemon(attackerIsPlayer);
    const defender = this.getRunPokemon(!attackerIsPlayer);
    if (!attacker || !defender) return;

    if (behavior.isHpEqualizingDamage) {
      const latestDef = this.getRunPokemon(!attackerIsPlayer);
      const latestAtk = this.getRunPokemon(attackerIsPlayer);
      if (latestDef && latestAtk && latestDef.currentHp > latestAtk.currentHp) {
        this.damagePokemon(!attackerIsPlayer, latestDef.currentHp - latestAtk.currentHp);
        this.addLog(`${latestDef.pokemon.name} ora ha gli stessi HP di ${latestAtk.pokemon.name}!`);
      }
    }

    const statResults = processStatChanges(
      move,
      attacker.pokemon.name,
      defender.pokemon.name,
      attacker.statChanges,
      defender.statChanges,
    );

    for (const result of statResults) {
      const targetIsPlayer = result.targetIsAttacker ? attackerIsPlayer : !attackerIsPlayer;
      const target = this.getRunPokemon(targetIsPlayer);
      if (!target) continue;
      this.setRunPokemon(targetIsPlayer, {
        ...target,
        statChanges: {
          ...target.statChanges,
          [result.statName]: result.newStage,
        },
      });
      this.addLog(result.log.message);
    }

    const latestAttacker = this.getRunPokemon(attackerIsPlayer);
    const latestDefender = this.getRunPokemon(!attackerIsPlayer);
    if (!latestAttacker || !latestDefender) return;

    const statusResult = tryApplyStatusCondition(
      move,
      latestAttacker.pokemon.name,
      latestDefender.pokemon.name,
      latestDefender.status,
    );

    if (statusResult) {
      const targetIsPlayer = statusResult.targetIsAttacker ? attackerIsPlayer : !attackerIsPlayer;
      const target = this.getRunPokemon(targetIsPlayer);
      if (target) {
        this.setRunPokemon(targetIsPlayer, {
          ...target,
          status: statusResult.status === 'confusion' ? target.status : statusResult.status,
          sleepTurns: statusResult.sleepTurns ?? target.sleepTurns,
          confusionTurns: statusResult.confusionTurns ?? target.confusionTurns,
        });
      }
      statusResult.logs.forEach(log => this.addLog(log.message));
    }

    if (behavior.isTrap) {
      const target = this.getRunPokemon(!attackerIsPlayer);
      if (target && target.trapTurns <= 0) {
        const minTurns = behavior.trapTurnsMin ?? 2;
        const maxTurns = behavior.trapTurnsMax ?? 5;
        const trapTurns = Math.floor(Math.random() * (maxTurns - minTurns + 1)) + minTurns;
        this.setRunPokemon(!attackerIsPlayer, {
          ...target,
          trapTurns,
          trapResidualFraction: behavior.trapResidualFraction ?? (1 / 16),
        });
        this.addLog(`${target.pokemon.name} è intrappolato!`);
      }
    }

    if (behavior.isLeechSeedLike) {
      const target = this.getRunPokemon(!attackerIsPlayer);
      if (target && !target.seededByOpponent) {
        this.setRunPokemon(!attackerIsPlayer, {
          ...target,
          seededByOpponent: true,
        });
        this.addLog(`${target.pokemon.name} è stato seminato!`);
      }
    }

    if (behavior.drainPercent > 0 && dealtDamage > 0) {
      const heal = Math.max(1, Math.floor((dealtDamage * behavior.drainPercent) / 100));
      const healed = this.healPokemon(attackerIsPlayer, heal);
      const updated = this.getRunPokemon(attackerIsPlayer);
      if (healed > 0 && updated) {
        this.addLog(`${updated.pokemon.name} recupera ${healed} HP!`);
      }
    }

    if (behavior.recoilPercent > 0 && dealtDamage > 0) {
      const recoil = Math.max(1, Math.floor((dealtDamage * behavior.recoilPercent) / 100));
      const applied = this.damagePokemon(attackerIsPlayer, recoil);
      const updated = this.getRunPokemon(attackerIsPlayer);
      if (applied > 0 && updated) {
        this.addLog(`${updated.pokemon.name} subisce ${applied} danni da recoil!`);
      }
    }
  }

  private applyEndOfTurnEffects(): void {
    this.applyEndOfTurnEffectsFor(true);
    this.applyEndOfTurnEffectsFor(false);
  }

  private applyEndOfTurnEffectsFor(targetIsPlayer: boolean): void {
    const target = this.getRunPokemon(targetIsPlayer);
    const opponent = this.getRunPokemon(!targetIsPlayer);
    if (!target || !opponent || target.currentHp <= 0) return;

    let nextTarget = { ...target };
    let nextOpponent = { ...opponent };

    const statusDmg = calculateEndTurnStatusDamage(nextTarget.status, nextTarget.maxHp);
    if (statusDmg > 0) {
      const applied = Math.min(nextTarget.currentHp, statusDmg);
      nextTarget.currentHp = Math.max(0, nextTarget.currentHp - applied);
      this.addLog(`${nextTarget.pokemon.name} subisce ${applied} danni da ${nextTarget.status}.`);
    }

    if (nextTarget.currentHp > 0 && nextTarget.trapTurns > 0) {
      const fraction = nextTarget.trapResidualFraction ?? (1 / 16);
      const trapDamage = Math.max(1, Math.floor(nextTarget.maxHp * fraction));
      const applied = Math.min(nextTarget.currentHp, trapDamage);
      nextTarget.currentHp = Math.max(0, nextTarget.currentHp - applied);
      nextTarget.trapTurns = Math.max(0, nextTarget.trapTurns - 1);
      if (nextTarget.trapTurns === 0) nextTarget.trapResidualFraction = null;
      this.addLog(`${nextTarget.pokemon.name} subisce ${applied} danni da intrappolamento.`);
    }

    if (nextTarget.currentHp > 0 && nextTarget.seededByOpponent && nextOpponent.currentHp > 0) {
      const seedDamage = Math.max(1, Math.floor(nextTarget.maxHp / 8));
      const applied = Math.min(nextTarget.currentHp, seedDamage);
      nextTarget.currentHp = Math.max(0, nextTarget.currentHp - applied);
      const heal = Math.min(nextOpponent.maxHp - nextOpponent.currentHp, applied);
      nextOpponent.currentHp = Math.min(nextOpponent.maxHp, nextOpponent.currentHp + heal);
      this.addLog(`${nextTarget.pokemon.name} perde ${applied} HP per assorbimento.`);
      if (heal > 0) this.addLog(`${nextOpponent.pokemon.name} recupera ${heal} HP.`);
    }

    this.setRunPokemon(targetIsPlayer, nextTarget);
    this.setRunPokemon(!targetIsPlayer, nextOpponent);
  }

  private async spawnEnemyForCurrentStage(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const stage = this.currentStage();
      // Stage 1 => Lv 5, poi +1 livello ad ogni stage
      const enemyLevel = stage + 4;
      const [minBst, maxBst] = this.getBstRangeForStage(stage);
      const pokemon = await this.getRandomPokemonByBst(minBst, maxBst);
      const moves = await this.getMovesForLevel(pokemon, enemyLevel, true);

      const bonusStats = this.createEmptyBonusStats();
      const baseHp = this.calculateStatValue(pokemon, 'hp', enemyLevel, bonusStats);
      const isMiniBoss = stage % 10 === 0;
      const maxHp = isMiniBoss ? baseHp * 2 : baseHp;

      this.enemy.set({
        pokemon,
        level: enemyLevel,
        currentHp: maxHp,
        maxHp,
        bonusStats,
        moves,
        bst: calculateBst(pokemon),
        status: null,
        sleepTurns: 0,
        confusionTurns: 0,
        statChanges: {},
        protected: false,
        mustRecharge: false,
        pendingChargeMove: null,
        trapTurns: 0,
        trapResidualFraction: null,
        seededByOpponent: false,
      });

      let curedStatusBeforeBattle = false;
      let resetStatChangesBeforeBattle = false;
      let playerNameForResetLogs: string | null = null;

      const player = this.player();
      if (player) {
        const hadStatus = !!player.status;
        const hadStatChanges = Object.keys(player.statChanges ?? {}).length > 0;
        const shouldCureStatus = hadStatus && Math.random() < 0.3;

        const nextPlayer: ProRunPokemon = {
          ...player,
          statChanges: {},
          protected: false,
          mustRecharge: false,
          pendingChargeMove: null,
          trapTurns: 0,
          trapResidualFraction: null,
          seededByOpponent: false,
          status: shouldCureStatus ? null : player.status,
          sleepTurns: shouldCureStatus ? 0 : player.sleepTurns,
        };

        this.player.set(nextPlayer);

        curedStatusBeforeBattle = shouldCureStatus;
        resetStatChangesBeforeBattle = hadStatChanges;
        playerNameForResetLogs = nextPlayer.pokemon.name;
      }

      // Reset log ad ogni nuova battaglia/stage
      this.battleLog.set([]);
      if (isMiniBoss) {
        this.addLog(`Mini Boss del livello ${stage}! ${pokemon.name} ha HP x2.`);
      }
      this.addLog(`Livello ${stage}: nemico ${pokemon.name} (BST ${calculateBst(pokemon)}).`);

      if (playerNameForResetLogs && curedStatusBeforeBattle) {
        this.addLog(`${playerNameForResetLogs} si è curato dallo stato alterato prima della nuova battaglia!`);
      }
      if (playerNameForResetLogs && resetStatChangesBeforeBattle) {
        this.addLog(`Le modifiche alle statistiche di ${playerNameForResetLogs} sono state resettate.`);
      }
    } catch (err) {
      this.error.set(this.toErrorMessage(err, 'Impossibile generare il nemico del livello.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private getMiniBossReward(stage: number): number {
    return 20 + stage * 2;
  }

  private async getRandomPokemonByBst(minBst: number, maxBst: number): Promise<Pokemon> {
    for (let i = 0; i < 40; i++) {
      const id = Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
      const pokemon = await firstValueFrom(this.pokemonApi.getPokemonById(id));
      const bst = calculateBst(pokemon);
      if (bst >= minBst && bst <= maxBst) {
        return pokemon;
      }
    }

    // fallback: se non trova in 40 tentativi, prova deterministicamente in una finestra
    for (let id = 1; id <= MAX_POKEMON_ID; id += 7) {
      const pokemon = await firstValueFrom(this.pokemonApi.getPokemonById(id));
      const bst = calculateBst(pokemon);
      if (bst >= minBst && bst <= maxBst) {
        return pokemon;
      }
    }

    throw new Error(`Nessun Pokémon trovato per BST ${minBst}-${maxBst}.`);
  }

  private async getMovesForLevel(pokemon: Pokemon, level: number, randomize: boolean): Promise<SelectedMove[]> {
    const levelUpMoves = (pokemon.moves ?? [])
      .filter(entry => entry.version_group_details?.some(v =>
        v.move_learn_method?.name === 'level-up' && v.level_learned_at <= level,
      ))
      .map(entry => entry.move);

    const uniqueByName = Array.from(new Map(levelUpMoves.map(m => [m.name, m])).values());
    const fallbackMoves = (pokemon.moves ?? []).slice(0, 20).map(m => m.move);
    const pool = uniqueByName.length ? uniqueByName : fallbackMoves;

    const chosen = randomize
      ? this.pickRandom(pool, Math.min(4, pool.length))
      : pool.slice(0, Math.min(4, pool.length));

    if (!chosen.length) {
      return [{ name: 'struggle', power: 50, accuracy: 100, pp: 1 } as SelectedMove];
    }

    try {
      const detailed = await firstValueFrom(this.moveApi.fetchMovesDetails(chosen));
      return detailed.length ? detailed : chosen.map(m => ({ name: m.name, power: 40, accuracy: 100, pp: 35 } as SelectedMove));
    } catch {
      return chosen.map(m => ({ name: m.name, power: 40, accuracy: 100, pp: 35 } as SelectedMove));
    }
  }

  private async getFirstNewLearnableMove(
    pokemon: Pokemon,
    level: number,
    currentMoves: SelectedMove[],
  ): Promise<SelectedMove | null> {
    const alreadyKnown = new Set(currentMoves.map(m => m.name));
    const candidates = (pokemon.moves ?? [])
      .filter(entry => entry.version_group_details?.some(v =>
        v.move_learn_method?.name === 'level-up' && v.level_learned_at === level,
      ))
      .map(entry => entry.move)
      .filter(move => !alreadyKnown.has(move.name));

    if (!candidates.length) return null;

    try {
      const details = await firstValueFrom(this.moveApi.fetchMovesDetails([candidates[0]]));
      return details[0] ?? ({ name: candidates[0].name, power: 40, accuracy: 100, pp: 35 } as SelectedMove);
    } catch {
      return { name: candidates[0].name, power: 40, accuracy: 100, pp: 35 } as SelectedMove;
    }
  }

  private calculateStatValue(
    pokemon: Pokemon,
    stat: BattleStatName | string,
    level: number,
    bonusStats: BonusStats,
  ): number {
    const base = getBaseStat(pokemon, stat, stat === 'hp' ? 45 : 50);
    const bonus = bonusStats[stat as BattleStatName] ?? 0;

    if (stat === 'hp') {
      const levelComputed = Math.floor(((base * 2 + 10) * level) / 50) + level + 10;
      return levelComputed + bonus;
    }
    const levelComputed = Math.floor(((base * 2 + 5) * level) / 50) + 5;
    return levelComputed + bonus;
  }

  private getBstRangeForStage(stage: number): [number, number] {
    if (stage <= 30) return [0, 299];
    if (stage <= 50) return [300, 499];
    if (stage <= 99) return [500, 670];
    return [671, 9999];
  }

  private getUnlockCost(bst: number): number {
    if (bst >= 500) {
      // Costi volutamente alti per 500+ BST
      return Math.floor((bst - 450) * 20);
    }
    if (bst >= 300) {
      return Math.floor((bst - 250) * 4);
    }
    return Math.max(60, Math.floor(bst * 1.1));
  }

  private getRunReward(): number {
    // Ricompensa significativa, ma non sufficiente a sbloccare facilmente tutti i 500+
    return 1200;
  }

  private async loadProgress(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) {
      this.points.set(0);
      this.unlockedStarterIds.set([...DEFAULT_STARTERS]);
      return;
    }

    const { data, error } = await this.supabase
      .from('pro_progress')
      .select('points, unlocked_starters')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      this.points.set(0);
      this.unlockedStarterIds.set([...DEFAULT_STARTERS]);
      await this.saveProgress();
      return;
    }

    const loadedPoints = Number(data.points ?? 0);
    const loadedUnlocked = Array.isArray(data.unlocked_starters)
      ? data.unlocked_starters.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v) && v > 0)
      : [];

    const merged = Array.from(new Set([...DEFAULT_STARTERS, ...loadedUnlocked])).sort((a, b) => a - b);
    this.points.set(loadedPoints);
    this.unlockedStarterIds.set(merged);
  }

  private async loadShinyStarters(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) {
      this.shinyStarterIds.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('user_shiny_pokemon')
        .select('pokemon_id')
        .eq('user_id', userId);

      if (error) throw error;

      const ids = (data ?? [])
        .map((row: any) => Number(row.pokemon_id))
        .filter((id: number) => Number.isInteger(id) && id > 0);

      this.shinyStarterIds.set(Array.from(new Set(ids)).sort((a, b) => a - b));
    } catch {
      this.shinyStarterIds.set([]);
    }
  }

  private async awardShinyStarter(pokemonId: number): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) return;

    try {
      const { error } = await this.supabase
        .from('user_shiny_pokemon')
        .upsert({ user_id: userId, pokemon_id: pokemonId, obtained_at: new Date().toISOString() });
      if (error) throw error;

      this.shinyStarterIds.update(ids => Array.from(new Set([...ids, pokemonId])).sort((a, b) => a - b));
    } catch {
      // tabella opzionale: non bloccare la reward principale
    }
  }

  private applyUserShinyIfOwned(pokemon: Pokemon): Pokemon {
    if (!this.shinyStarterIds().includes(pokemon.id)) return pokemon;

    return {
      ...pokemon,
      sprites: {
        ...pokemon.sprites,
        front_default: pokemon.sprites.front_shiny || pokemon.sprites.front_default,
        back_default: pokemon.sprites.back_shiny || pokemon.sprites.back_default,
        other: {
          ...pokemon.sprites.other,
          showdown: {
            ...pokemon.sprites.other.showdown,
            front_default: pokemon.sprites.other.showdown?.front_shiny || pokemon.sprites.other.showdown?.front_default,
            back_default: pokemon.sprites.other.showdown?.back_shiny || pokemon.sprites.other.showdown?.back_default,
          },
        },
      },
    };
  }

  private async saveProgress(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) return;

    const payload = {
      user_id: userId,
      points: this.points(),
      unlocked_starters: this.unlockedStarterIds(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.from('pro_progress').upsert(payload);
    if (error) {
      throw error;
    }
  }

  private async loadUnlockedStarters(): Promise<void> {
    const ids = this.unlockedStarterIds();
    const loaded: Pokemon[] = [];
    for (const id of ids) {
      try {
        const p = await firstValueFrom(this.pokemonApi.getPokemonById(id));
        loaded.push(p);
      } catch {
        // ignora id non validi
      }
    }
    this.unlockedStarters.set(loaded.sort((a, b) => a.id - b.id));
  }

  private async loadStarterCatalog(): Promise<void> {
    const response = await firstValueFrom(this.pokemonApi.getPokemonList(MAX_POKEMON_ID));
    const list = (response.results ?? [])
      .map(item => {
        const id = this.extractIdFromPokemonUrl(item.url);
        if (!id) return null;
        return {
          id,
          name: item.name,
          spriteUrl: this.getCatalogSpriteUrl(id),
        } as StarterCatalogEntry;
      })
      .filter((entry): entry is StarterCatalogEntry => !!entry)
      .sort((a, b) => a.id - b.id);

    this.starterCatalog.set(list);
  }

  private extractIdFromPokemonUrl(url: string): number | null {
    const match = url.match(/\/pokemon\/(\d+)\/?$/i);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private getCatalogSpriteUrl(id: number): string {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  }

  private createEmptyBonusStats(): BonusStats {
    return {
      hp: 0,
      attack: 0,
      defense: 0,
      'special-attack': 0,
      'special-defense': 0,
      speed: 0,
    };
  }

  private mergeBonusStats(a: BonusStats, b: BonusStats): BonusStats {
    return {
      hp: (a.hp ?? 0) + (b.hp ?? 0),
      attack: (a.attack ?? 0) + (b.attack ?? 0),
      defense: (a.defense ?? 0) + (b.defense ?? 0),
      'special-attack': (a['special-attack'] ?? 0) + (b['special-attack'] ?? 0),
      'special-defense': (a['special-defense'] ?? 0) + (b['special-defense'] ?? 0),
      speed: (a.speed ?? 0) + (b.speed ?? 0),
    };
  }

  private distributeRandomPoints(count: number): BonusStats {
    const delta = this.createEmptyBonusStats();
    for (let i = 0; i < count; i++) {
      const key = BATTLE_STATS[Math.floor(Math.random() * BATTLE_STATS.length)];
      delta[key] += 1;
    }
    return delta;
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  private addLog(message: string): void {
    this.battleLog.update(logs => [message, ...logs].slice(0, 40));
  }

  private setupRunPersistenceEffect(): void {
    effect(() => {
      if (!this.runSnapshotReady || this.runSnapshotHydrating) return;
      if (this.showResumeRunPrompt()) return;

      if (!this.runActive()) {
        this.clearRunSnapshot();
        return;
      }

      // Evita di sovrascrivere l'ultimo snapshot valido durante stati transitori
      // (es. spawn nemico in corso con run attiva ma enemy momentaneamente null).
      if (!this.player()) return;
      const enemyMissingInInvalidPhase = !this.enemy() && !this.waitingStatAllocation() && !this.transitioningToLevelUp();
      if (enemyMissingInInvalidPhase) return;

      this.scheduleRunSnapshotSave(this.buildCurrentRunSnapshot());
    });
  }

  private async restoreRunSnapshot(): Promise<void> {
    const snapshot = await this.loadRunSnapshotFromDb() ?? this.loadRunSnapshotFromLocal();
    if (!snapshot) return;

    const hasPlayer = !!snapshot?.player;
    const hasEnemyWhenRequired = !snapshot.runActive
      || !!snapshot.enemy
      || !!snapshot.waitingStatAllocation
      || !!snapshot.transitioningToLevelUp;
    const hasValidBattleState = hasPlayer && hasEnemyWhenRequired;
    if (!hasValidBattleState) {
      this.clearRunSnapshot();
      return;
    }

    if (!snapshot.runActive) {
      this.clearRunSnapshot();
      return;
    }

    this.pendingRunSnapshot = snapshot;
    this.showResumeRunPrompt.set(true);
    this.resumeRunPromptStage.set(Number(snapshot.currentStage ?? 0));
    this.resumeRunPromptPokemonName.set(snapshot.player?.pokemon?.name ?? '');
  }

  resumeRunFromSnapshot(): void {
    if (!this.pendingRunSnapshot) return;

    this.applyRunSnapshot(this.pendingRunSnapshot);
    this.pendingRunSnapshot = null;
    this.showResumeRunPrompt.set(false);
    this.resumeRunPromptStage.set(null);
    this.resumeRunPromptPokemonName.set('');
  }

  discardRunSnapshot(): void {
    this.pendingRunSnapshot = null;
    this.showResumeRunPrompt.set(false);
    this.resumeRunPromptStage.set(null);
    this.resumeRunPromptPokemonName.set('');
    this.clearRunSnapshot();
  }

  private applyRunSnapshot(snapshot: ProRunSnapshot): void {
    try {
      this.runSnapshotHydrating = true;

      this.runActive.set(!!snapshot.runActive);
      this.runWon.set(!!snapshot.runWon);
      this.awaitingRunEndContinue.set(!!snapshot.awaitingRunEndContinue);
      this.currentStage.set(Number(snapshot.currentStage ?? 0));
      this.pendingStatPoints.set(Number(snapshot.pendingStatPoints ?? 0));
      this.waitingStatAllocation.set(!!snapshot.waitingStatAllocation);
      this.transitioningToLevelUp.set(!!snapshot.transitioningToLevelUp);
      this.playerAttacking.set(false);
      this.enemyAttacking.set(false);
      this.player.set(snapshot.player ?? null);
      this.enemy.set(snapshot.enemy ?? null);
      this.statDraftDelta.set(snapshot.statDraftDelta ?? this.createEmptyBonusStats());
      this.randomLevelUpDelta.set(snapshot.randomLevelUpDelta ?? this.createEmptyBonusStats());
      this.pendingNewMove.set(snapshot.pendingNewMove ?? null);
      this.showSkipMoveConfirm.set(!!snapshot.showSkipMoveConfirm);
      this.battleLog.set(Array.isArray(snapshot.battleLog) ? snapshot.battleLog.slice(0, 40) : []);
    } catch {
      this.clearRunSnapshot();
    } finally {
      this.runSnapshotHydrating = false;
    }
  }

  private scheduleRunSnapshotSave(snapshot: ProRunSnapshot): void {
    if (this.runSnapshotSaveTimer) clearTimeout(this.runSnapshotSaveTimer);
    this.runSnapshotSaveTimer = setTimeout(() => {
      void this.saveRunSnapshot(snapshot);
    }, 250);
  }

  private async forcePersistRunSnapshotNow(): Promise<void> {
    if (!this.runActive() || !this.player()) return;

    const enemyMissingInInvalidPhase = !this.enemy() && !this.waitingStatAllocation() && !this.transitioningToLevelUp();
    if (enemyMissingInInvalidPhase) return;

    if (this.runSnapshotSaveTimer) {
      clearTimeout(this.runSnapshotSaveTimer);
      this.runSnapshotSaveTimer = null;
    }

    await this.saveRunSnapshot(this.buildCurrentRunSnapshot());
  }

  private buildCurrentRunSnapshot(): ProRunSnapshot {
    return {
      runActive: this.runActive(),
      runWon: this.runWon(),
      awaitingRunEndContinue: this.awaitingRunEndContinue(),
      currentStage: this.currentStage(),
      pendingStatPoints: this.pendingStatPoints(),
      waitingStatAllocation: this.waitingStatAllocation(),
      transitioningToLevelUp: this.transitioningToLevelUp(),
      playerAttacking: this.playerAttacking(),
      enemyAttacking: this.enemyAttacking(),
      player: this.player(),
      enemy: this.enemy(),
      statDraftDelta: this.statDraftDelta(),
      randomLevelUpDelta: this.randomLevelUpDelta(),
      pendingNewMove: this.pendingNewMove(),
      showSkipMoveConfirm: this.showSkipMoveConfirm(),
      battleLog: this.battleLog(),
    };
  }

  private async saveRunSnapshot(snapshot: ProRunSnapshot): Promise<void> {
    await this.saveRunSnapshotToDb(snapshot);
    try {
      localStorage.setItem(this.runStorageKey, JSON.stringify(snapshot));
    } catch {
      // ignore storage errors
    }
  }

  private clearRunSnapshot(): void {
    if (this.runSnapshotSaveTimer) {
      clearTimeout(this.runSnapshotSaveTimer);
      this.runSnapshotSaveTimer = null;
    }

    void this.clearRunSnapshotInDb();

    try {
      localStorage.removeItem(this.runStorageKey);
    } catch {
      // ignore storage errors
    }
  }

  private loadRunSnapshotFromLocal(): ProRunSnapshot | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.runStorageKey);
    } catch {
      return null;
    }

    if (!raw) return null;

    try {
      return JSON.parse(raw) as ProRunSnapshot;
    } catch {
      return null;
    }
  }

  private async loadRunSnapshotFromDb(): Promise<ProRunSnapshot | null> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) return null;

    try {
      const { data, error } = await this.supabase
        .from(this.runSnapshotTable)
        .select('snapshot')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data?.snapshot) return null;
      return data.snapshot as ProRunSnapshot;
    } catch {
      return null;
    }
  }

  private async saveRunSnapshotToDb(snapshot: ProRunSnapshot): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) return;

    try {
      await this.supabase
        .from(this.runSnapshotTable)
        .upsert({
          user_id: userId,
          snapshot,
          updated_at: new Date().toISOString(),
        });
    } catch {
      // ignore db snapshot errors
    }
  }

  private async clearRunSnapshotInDb(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !this.isDbConfigured()) return;

    try {
      await this.supabase
        .from(this.runSnapshotTable)
        .delete()
        .eq('user_id', userId);
    } catch {
      // ignore db snapshot errors
    }
  }

  private isDbConfigured(): boolean {
    return !environment.supabaseUrl.includes('YOUR_SUPABASE_URL_HERE')
      && !environment.supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY_HERE');
  }

  private toErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private markRunAsLost(faintedPokemonName: string): void {
    if (this.awaitingRunEndContinue()) return;

    this.clearRunSnapshot();
    this.runActive.set(false);
    this.runWon.set(false);
    this.waitingStatAllocation.set(false);
    this.transitioningToLevelUp.set(false);
    this.awaitingRunEndContinue.set(true);
    this.addLog(`${faintedPokemonName} è KO. Run terminata al livello ${this.currentStage()}.`);
    this.addLog('Premi "Continua" per tornare alla scelta del Pokémon.');
  }
}
