import { Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page.component';
import { BattlePageComponent } from './features/battle/battle-page.component';
import { PokemonGeneratorPageComponent } from './features/pokemon-generator/pokemon-generator-page.component';

export const routes: Routes = [
  { path: '',        component: HomePageComponent },
  { path: 'battle',  component: BattlePageComponent },
  { path: 'pokemon', component: PokemonGeneratorPageComponent },
];
