import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { MoveReference } from '../models/pokemon.model';
import { SelectedMove } from '../models/move.model';

/**
 * Service for fetching move details from the PokéAPI.
 */
@Injectable({ providedIn: 'root' })
export class MoveApiService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch full details for multiple moves in parallel.
   * Returns an array of SelectedMove preserving the input order.
   */
  fetchMovesDetails(moves: MoveReference[]): Observable<SelectedMove[]> {
    if (!moves?.length) return of([]);

    const requests = moves.map(m => this.http.get<any>(m.url));

    return forkJoin(requests).pipe(
      map((responses: any[]) =>
        moves.map((moveRef, index) => {
          const detail = responses[index] ?? {};
          const effectEntry = Array.isArray(detail.effect_entries)
            ? detail.effect_entries.find((e: any) => e.language?.name === 'en')
            : undefined;

          return {
            ...(detail as SelectedMove),
            name: detail.name ?? moveRef.name,
            shortEffect: effectEntry?.short_effect ?? effectEntry?.effect ?? null,
          } as SelectedMove;
        }),
      ),
    );
  }
}
