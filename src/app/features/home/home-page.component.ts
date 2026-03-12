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
      <button routerLink="/battle" class="start-button">Inizia la lotta</button>
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
    .start-button {
      padding: 0.8rem 1.2rem;
      font-size: 1.1rem;
      border-radius: 8px;
      background: #ff595e;
      color: white;
      border: none;
      cursor: pointer;
    }
  `],
})
export class HomePageComponent {}
