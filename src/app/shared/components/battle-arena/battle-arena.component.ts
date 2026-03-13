import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Pokemon } from '../../../core/models/pokemon.model';
import { getHpBarColorClass, getHpPercentage } from '../../../core/utils/hp.utils';
import { STATUS_ABBREVIATIONS } from '../../../core/constants/status.constant';

@Component({
  selector: 'app-battle-arena',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './battle-arena.component.html',
  styleUrls: ['./battle-arena.component.scss'],
})
export class BattleArenaComponent implements OnChanges {
  @Input({ required: true }) playerPokemon!: Pokemon;
  @Input({ required: true }) enemyPokemon!: Pokemon;

  @Input({ required: true }) playerCurrentHp!: number;
  @Input({ required: true }) playerMaxHp!: number;
  @Input({ required: true }) enemyCurrentHp!: number;
  @Input({ required: true }) enemyMaxHp!: number;

  @Input() playerLevel = 1;
  @Input() enemyLevel = 1;
  @Input() playerAttacking = false;
  @Input() enemyAttacking = false;
  @Input() playerStatus: string | null = null;
  @Input() enemyStatus: string | null = null;
  @Input() playerConfusionTurns = 0;
  @Input() enemyConfusionTurns = 0;

  playerHpHit = false;
  enemyHpHit = false;
  private lastPlayerHp: number | null = null;
  private lastEnemyHp: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['playerCurrentHp']) {
      if (this.lastPlayerHp !== null && this.playerCurrentHp < this.lastPlayerHp) {
        this.playerHpHit = true;
        setTimeout(() => (this.playerHpHit = false), 260);
      }
      this.lastPlayerHp = this.playerCurrentHp;
    }

    if (changes['enemyCurrentHp']) {
      if (this.lastEnemyHp !== null && this.enemyCurrentHp < this.lastEnemyHp) {
        this.enemyHpHit = true;
        setTimeout(() => (this.enemyHpHit = false), 260);
      }
      this.lastEnemyHp = this.enemyCurrentHp;
    }
  }

  get playerHpPercent(): number {
    return getHpPercentage(this.playerCurrentHp, this.playerMaxHp);
  }

  get enemyHpPercent(): number {
    return getHpPercentage(this.enemyCurrentHp, this.enemyMaxHp);
  }

  hpClass(percentage: number): string {
    return getHpBarColorClass(percentage);
  }

  statusAbbreviation(status: string | null): string {
    if (!status) return '';
    return STATUS_ABBREVIATIONS[status] ?? status.toUpperCase();
  }

  get playerSpriteBack(): string {
    return this.playerPokemon?.sprites?.other?.showdown?.back_default
      || this.playerPokemon?.sprites?.back_default
      || this.playerPokemon?.sprites?.front_default
      || '';
  }

  get enemySpriteFront(): string {
    return this.enemyPokemon?.sprites?.other?.showdown?.front_default
      || this.enemyPokemon?.sprites?.front_default
      || '';
  }

  getPokemonTypeNames(pokemon: Pokemon): string[] {
    return (pokemon.types ?? []).map(t => t.type.name);
  }

  getTypeIcon(typeName: string): string {
    const icons: Record<string, string> = {
      normal: '⚪',
      fire: '🔥',
      water: '💧',
      electric: '⚡',
      grass: '🌿',
      ice: '❄️',
      fighting: '🥊',
      poison: '☠️',
      ground: '🪨',
      flying: '🕊️',
      psychic: '🔮',
      bug: '🐛',
      rock: '🪵',
      ghost: '👻',
      dragon: '🐉',
      dark: '🌑',
      steel: '⚙️',
      fairy: '✨',
    };

    return icons[typeName] ?? '◼️';
  }
}
