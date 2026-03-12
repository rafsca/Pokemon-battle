import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Pokemon } from '../models/pokemon.model';

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2/pokemon';
const MAX_POKEMON_ID = 1025;

/**
 * Service for fetching Pokémon data from the PokéAPI.
 */
@Injectable({ providedIn: 'root' })
export class PokemonApiService {
  constructor(private readonly http: HttpClient) {}

  /** Fetch a Pokémon by its national dex ID. */
  getPokemonById(id: number): Observable<Pokemon> {
    return this.http.get<Pokemon>(`${POKEAPI_BASE_URL}/${id}/`);
  }

  /** Fetch a random Pokémon (ID 1–1025). */
  getRandomPokemon(): Observable<Pokemon> {
    const id = Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
    return this.getPokemonById(id);
  }
}
