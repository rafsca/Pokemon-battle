import { Routes } from '@angular/router';
import { HomePageComponent } from './features/home/home-page.component';
import { BattlePageComponent } from './features/battle/battle-page.component';
import { PokemonGeneratorPageComponent } from './features/pokemon-generator/pokemon-generator-page.component';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { ProModePageComponent } from './features/pro-mode/pro-mode-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '',        component: HomePageComponent },
  { path: 'battle',  component: BattlePageComponent },
  { path: 'pokemon', component: PokemonGeneratorPageComponent },
  { path: 'auth', component: AuthPageComponent },
  { path: 'battle-pro', component: ProModePageComponent, canActivate: [authGuard] },
];
