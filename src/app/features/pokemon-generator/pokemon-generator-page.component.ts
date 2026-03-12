import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PokemonCardComponent } from '../../shared/components/pokemon-card/pokemon-card.component';

/**
 * Page that generates and displays a random Pokémon.
 */
@Component({
  selector: 'app-pokemon-generator-page',
  standalone: true,
  imports: [CommonModule, PokemonCardComponent],
  templateUrl: './pokemon-generator-page.component.html',
  styleUrls: ['./pokemon-generator-page.component.scss'],
})
export class PokemonGeneratorPageComponent {}
