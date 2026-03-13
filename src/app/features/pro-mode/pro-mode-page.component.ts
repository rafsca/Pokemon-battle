import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BattleStatView, ProModeService } from './pro-mode.service';
import { BattleArenaComponent } from '../../shared/components/battle-arena/battle-arena.component';
import { SelectedMove } from '../../core/models/move.model';
import { LanguageService } from '../../core/services/language.service';

@Component({
  selector: 'app-pro-mode-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BattleArenaComponent],
  templateUrl: './pro-mode-page.component.html',
  styleUrls: ['./pro-mode-page.component.scss'],
})
export class ProModePageComponent implements OnDestroy {
  selectedStarterId = signal<number | null>(null);
  starterSearch = signal('');

  showMoveEffectModal = signal(false);
  moveEffectModalTitle = signal('');
  moveEffectModalText = signal('');
  private hoverEffectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly pro: ProModeService,
    public readonly lang: LanguageService,
  ) {
    this.pro.initialize();

    effect(() => {
      const shouldHideMoveModal = !this.pro.runActive()
        || !this.pro.player()
        || !this.pro.enemy()
        || this.pro.waitingStatAllocation()
        || this.pro.transitioningToLevelUp()
        || this.pro.showResumeRunPrompt();

      if (shouldHideMoveModal) {
        this.onMoveHoverEnd();
      }
    });
  }

  getStatPointLabel(stat: string): string {
    const map: Record<string, string> = {
      hp: 'HP',
      attack: 'Atk',
      defense: 'Def',
      'special-attack': 'SpA',
      'special-defense': 'SpD',
      speed: 'Spe',
    };
    return map[stat] ?? stat;
  }

  async startWithSelected(): Promise<void> {
    const id = this.selectedStarterId();
    if (!id) return;
    await this.pro.startRun(id);
  }

  async onStarterCardClick(id: number): Promise<void> {
    if (this.pro.isStarterUnlocked(id)) {
      this.selectedStarterId.set(id);
      this.pro.unlockCandidate.set(null);
      this.pro.unlockCandidateCost.set(0);
      return;
    }

    this.selectedStarterId.set(null);
    await this.pro.prepareUnlockCandidateById(id);
  }

  getBstRangeLabel(stage: number): string {
    if (stage <= 30) return '0-299';
    if (stage <= 50) return '300-499';
    if (stage <= 99) return '500-670';
    return '671+';
  }

  isUnlocked(id: number): boolean {
    return this.pro.isStarterUnlocked(id);
  }

  isSelectedStarter(id: number): boolean {
    return this.selectedStarterId() === id;
  }

  isShiny(id: number): boolean {
    return this.pro.shinyStarterIds().includes(id);
  }

  get playerStats(): BattleStatView[] {
    return this.pro.getRunStats('player');
  }

  get enemyStats(): BattleStatView[] {
    return this.pro.getRunStats('enemy');
  }

  getDraftValue(stat: string): number {
    const draft = this.pro.statDraftDelta();
    const key = stat as keyof typeof draft;
    return draft[key] ?? 0;
  }

  get selectedStarterName(): string {
    const id = this.selectedStarterId();
    if (!id) return '';
    const entry = this.pro.starterCatalog().find(p => p.id === id);
    const capitalized = entry?.name ? entry.name.charAt(0).toUpperCase() + entry.name.slice(1) : `#${id}`;
    return capitalized;
  }

  get filteredStarterCatalog() {
    const query = this.starterSearch().trim().toLowerCase();
    if (!query) return this.pro.starterCatalog();

    return this.pro
      .starterCatalog()
      .filter(entry => `${entry.id}`.includes(query) || entry.name.toLowerCase().includes(query));
  }

  onStarterSearch(value: string): void {
    this.starterSearch.set(value);
  }

  getMoveTypeLabel(move: SelectedMove): string {
    return this.lang.getTypeLabel(move.type?.name);
  }

  getLocalizedMoveName(move: SelectedMove): string {
    return this.lang.getLocalizedMoveName(move);
  }

  ngOnDestroy(): void {
    this.onMoveHoverEnd();
  }

  onMoveHoverStart(move: SelectedMove): void {
    this.onMoveHoverEnd();
    this.hoverEffectTimer = setTimeout(() => {
      this.moveEffectModalTitle.set(this.getLocalizedMoveName(move));
      this.moveEffectModalText.set(this.getMoveEffectText(move));
      this.showMoveEffectModal.set(true);
    }, 1000);
  }

  onMoveHoverEnd(): void {
    if (this.hoverEffectTimer) {
      clearTimeout(this.hoverEffectTimer);
      this.hoverEffectTimer = null;
    }
    this.showMoveEffectModal.set(false);
  }

  private getMoveEffectText(move: SelectedMove): string {
    return this.lang.getLocalizedMoveEffectText(move);
  }
}
