import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Pokemon } from '../module/pokemon';

@Injectable({ providedIn: 'root' })
export class PokemonService {
    constructor(private http: HttpClient) { }

    getPokemon(id: number): Observable<Pokemon> {
        return this.http.get<Pokemon>(`https://pokeapi.co/api/v2/pokemon/${id}/`);
    }

    getRandomPokemon(): Observable<Pokemon> {
        const id = Math.floor(Math.random() * 1025) + 1;
        return this.getPokemon(id);
    }
}