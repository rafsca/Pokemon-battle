import { Component, input, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BattleLogEntry } from '../../../core/models/battle.model';

/**
 * Displays a scrollable battle log with color-coded entries by type.
 */
@Component({
  selector: 'app-battle-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './battle-log.component.html',
  styleUrls: ['./battle-log.component.scss'],
})
export class BattleLogComponent {
  logs = input<BattleLogEntry[]>([]);

  @ViewChild('logContainer') logContainer?: ElementRef;

  constructor() {
    effect(() => {
      const currentLogs = this.logs();
      if (currentLogs.length > 0) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
  }

  getLogClass(type?: string): string {
    const classMap: Record<string, string> = {
      action:  'log-action',
      damage:  'log-damage',
      status:  'log-status',
      stat:    'log-stat',
      effect:  'log-effect',
      info:    'log-info',
    };
    return classMap[type ?? ''] ?? 'log-default';
  }

  private scrollToBottom(): void {
    if (this.logContainer) {
      const el = this.logContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
