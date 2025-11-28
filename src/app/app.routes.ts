import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { BattleComponent } from './pages/battle/battle';
import { PokemonComponent } from './pages/pokemon-generator/pokemon';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'battle', component: BattleComponent },
    { path: 'pokemon', component: PokemonComponent },

];
