import { Component, input, effect, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BattleLogEntry {
    message: string;
    type?: 'action' | 'damage' | 'status' | 'stat' | 'effect' | 'info';
    timestamp: number;
}

@Component({
    selector: 'app-battle-log',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './battle-log.component.html',
    styleUrls: ['./battle-log.component.scss']
})
export class BattleLogComponent {
    logs = input<BattleLogEntry[]>([]);
    @ViewChild('logContainer') logContainer?: ElementRef;

    constructor() {
        // Auto-scroll quando vengono aggiunti nuovi log
        effect(() => {
            const currentLogs = this.logs();
            if (currentLogs.length > 0) {
                setTimeout(() => this.scrollToBottom(), 100);
            }
        });
    }

    private scrollToBottom(): void {
        if (this.logContainer) {
            const element = this.logContainer.nativeElement;
            element.scrollTop = element.scrollHeight;
        }
    }

    getLogClass(type?: string): string {
        switch (type) {
            case 'action': return 'log-action';
            case 'damage': return 'log-damage';
            case 'status': return 'log-status';
            case 'stat': return 'log-stat';
            case 'effect': return 'log-effect';
            case 'info': return 'log-info';
            default: return 'log-default';
        }
    }
}
