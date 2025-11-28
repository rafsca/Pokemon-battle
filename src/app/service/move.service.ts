import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Move } from '../module/pokemon';
import { SelectedMove } from '../module/move';

@Injectable({ providedIn: 'root' })
export class MoveService {
    constructor(private http: HttpClient) { }

    /**
     * Fetch move details in parallel and return an array of SelectedMove
     * Preserves order of the provided moves array.
     */
    fetchMovesDetails(moves: Move[]): Observable<SelectedMove[]> {
        if (!moves?.length) return new Observable<SelectedMove[]>(subscriber => { subscriber.next([]); subscriber.complete(); });

        const requests = moves.map(m => this.http.get<any>(m.url));
        return forkJoin(requests).pipe(
            map((details: any[]) => moves.map((m, i) => {
                const d = details[i] ?? {};

                // The move detail response from the API matches the shape in `module/move.ts`.
                // Use the returned detail object but ensure `name` is present (fallback to move summary name).
                const effectEntry = Array.isArray(d.effect_entries) ? d.effect_entries.find((e: any) => e.language?.name === 'en') : undefined;
                const selected = {
                    ...(d as SelectedMove),
                    name: d.name ?? m.name,
                    // derived for template convenience
                    shortEffect: effectEntry?.short_effect ?? effectEntry?.effect ?? null,
                } as SelectedMove & { shortEffect?: string | null };

                return selected;
            }))
        );
    }
}
