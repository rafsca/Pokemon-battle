import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Pokemon } from '../models/pokemon.model';

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2/pokemon';
const MAX_POKEMON_ID = 1025;

export interface PokemonListItem {
  name: string;
  url: string;
}

export interface PokemonListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PokemonListItem[];
}

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

  /** Fetch a Pokémon by Pokédex id or name. */
  getPokemon(identifier: number | string): Observable<Pokemon> {
    return this.http.get<Pokemon>(`${POKEAPI_BASE_URL}/${String(identifier).toLowerCase()}/`);
  }

  /** Fetch a Pokémon by name. */
  getPokemonByName(name: string): Observable<Pokemon> {
    return this.getPokemon(name);
  }

  /** Fetch a random Pokémon (ID 1–1025). */
  getRandomPokemon(): Observable<Pokemon> {
    const id = Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
    return this.getPokemonById(id);
  }

  /** Fetch the Pokédex list from PokéAPI. */
  getPokemonList(limit = MAX_POKEMON_ID): Observable<PokemonListResponse> {
    return this.http.get<PokemonListResponse>(`${POKEAPI_BASE_URL}?limit=${limit}`);
  }
}
