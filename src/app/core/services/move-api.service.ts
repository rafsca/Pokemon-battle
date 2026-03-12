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
          const effectChance = detail.effect_chance;
          const effectEntries = Array.isArray(detail.effect_entries)
            ? detail.effect_entries.map((entry: any) => ({
                ...entry,
                effect: interpolateEffectChance(entry?.effect, effectChance),
                short_effect: interpolateEffectChance(entry?.short_effect, effectChance),
              }))
            : [];

          const effectEntry = effectEntries.find((e: any) => e.language?.name === 'en');

          return {
            ...(detail as SelectedMove),
            effect_entries: effectEntries,
            name: detail.name ?? moveRef.name,
            shortEffect: effectEntry?.short_effect ?? effectEntry?.effect ?? null,
          } as SelectedMove;
        }),
      ),
    );
  }
}

function interpolateEffectChance(text: unknown, effectChance: unknown): string {
  if (typeof text !== 'string') return '';
  if (typeof effectChance !== 'number' || Number.isNaN(effectChance)) return text;

  return text
    .replace(/\$effect_chance%/gi, `${effectChance}%`)
    .replace(/\$effect_chance/gi, `${effectChance}`);
}
