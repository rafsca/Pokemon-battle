import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { BattleStatView, ProModeService } from './pro-mode.service';
import { BattleArenaComponent } from '../../shared/components/battle-arena/battle-arena.component';

@Component({
  selector: 'app-pro-mode-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BattleArenaComponent],
  templateUrl: './pro-mode-page.component.html',
  styleUrls: ['./pro-mode-page.component.scss'],
})
export class ProModePageComponent {
  selectedStarterId = signal<number | null>(null);

  constructor(public readonly pro: ProModeService) {
    this.pro.initialize();
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
}
