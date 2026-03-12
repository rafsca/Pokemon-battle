import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container">
      <h1>Benvenuto a Pokémon Battle</h1>
      <p>Preparati a sfidare il tuo avversario!</p>
      <div class="actions">
        <button routerLink="/battle" class="start-button">Inizia la lotta</button>
        <button routerLink="/battle-pro" class="pro-button">Modalità Pro (login)</button>
      </div>
    </div>
  `,
  styles: [`
    .home-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 70vh;
      gap: 1rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .start-button {
      padding: 0.8rem 1.2rem;
      font-size: 1.1rem;
      border-radius: 8px;
      background: #ff595e;
      color: white;
      border: none;
      cursor: pointer;
    }
    .pro-button {
      padding: 0.8rem 1.2rem;
      font-size: 1rem;
      border-radius: 8px;
      background: #ffd166;
      color: #232323;
      border: none;
      cursor: pointer;
      font-weight: 700;
    }
  `],
})
export class HomePageComponent {}
