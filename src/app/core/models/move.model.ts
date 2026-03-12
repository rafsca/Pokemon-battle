/**
 * Move detail model interfaces based on the PokéAPI v2 response schema.
 * Represents the full detail of a move fetched from the API.
 * @see https://pokeapi.co/docs/v2#moves
 */

export interface SelectedMove {
  accuracy: number;
  contest_combos: ContestCombos;
  contest_effect: ContestEffect;
  contest_type: ContestType;
  damage_class: DamageClass;
  effect_chance: any;
  effect_changes: any[];
  effect_entries: EffectEntry[];
  flavor_text_entries: FlavorTextEntry[];
  generation: MoveGeneration;
  id: number;
  learned_by_pokemon: LearnedByPokemon[];
  machines: MachineEntry[];
  meta: MoveMeta;
  name: string;
  names: MoveName[];
  past_values: any[];
  power: number;
  pp: number;
  priority: number;
  stat_changes: any[];
  super_contest_effect: SuperContestEffect;
  target: MoveTarget;
  type: MoveType;
  /** Derived short effect (english) for template convenience. */
  shortEffect?: string | null;
}

// ─── Contest ────────────────────────────────────────────────────────────────

export interface ContestCombos {
  normal: ContestComboNormal;
  super: ContestComboSuper;
}

export interface ContestComboNormal {
  use_after: NamedResource[];
  use_before: any;
}

export interface ContestComboSuper {
  use_after: any;
  use_before: any;
}

export interface ContestEffect {
  url: string;
}

export interface ContestType {
  name: string;
  url: string;
}

// ─── Damage & Effects ───────────────────────────────────────────────────────

export interface DamageClass {
  name: string;
  url: string;
}

export interface EffectEntry {
  effect: string;
  language: NamedResource;
  short_effect: string;
}

export interface FlavorTextEntry {
  flavor_text: string;
  language: NamedResource;
  version_group: NamedResource;
}

export interface MoveGeneration {
  name: string;
  url: string;
}

export interface LearnedByPokemon {
  name: string;
  url: string;
}

// ─── Machines ───────────────────────────────────────────────────────────────

export interface MachineEntry {
  machine: MachineReference;
  version_group: NamedResource;
}

export interface MachineReference {
  url: string;
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export interface MoveMeta {
  ailment: MoveAilment;
  ailment_chance: number;
  category: MoveCategory;
  crit_rate: number;
  drain: number;
  flinch_chance: number;
  healing: number;
  max_hits: any;
  max_turns: any;
  min_hits: any;
  min_turns: any;
  stat_chance: number;
}

export interface MoveAilment {
  name: string;
  url: string;
}

export interface MoveCategory {
  name: string;
  url: string;
}

// ─── Naming & Targeting ─────────────────────────────────────────────────────

export interface MoveName {
  language: NamedResource;
  name: string;
}

export interface SuperContestEffect {
  url: string;
}

export interface MoveTarget {
  name: string;
  url: string;
}

export interface MoveType {
  name: string;
  url: string;
}

// ─── Shared ─────────────────────────────────────────────────────────────────

/** Reusable interface for simple { name, url } API references. */
export interface NamedResource {
  name: string;
  url: string;
}
