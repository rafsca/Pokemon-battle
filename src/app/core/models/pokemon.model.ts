/**
 * Pokemon model interfaces based on the PokéAPI v2 response schema.
 * @see https://pokeapi.co/docs/v2#pokemon
 */

// ─── Core Pokemon Interface ─────────────────────────────────────────────────

export interface Pokemon {
  abilities: Ability[];
  base_experience: number;
  cries: Cries;
  forms: Form[];
  game_indices: GameIndex[];
  height: number;
  held_items: any[];
  id: number;
  is_default: boolean;
  location_area_encounters: string;
  moves: PokemonMoveEntry[];
  name: string;
  order: number;
  past_abilities: PastAbility[];
  past_types: any[];
  species: Species;
  sprites: Sprites;
  stats: Stat[];
  types: PokemonType[];
  weight: number;
}

// ─── Abilities ──────────────────────────────────────────────────────────────

export interface Ability {
  ability: AbilityDetail;
  is_hidden: boolean;
  slot: number;
}

export interface AbilityDetail {
  name: string;
  url: string;
}

export interface PastAbility {
  abilities: PastAbilityEntry[];
  generation: Generation;
}

export interface PastAbilityEntry {
  ability: any;
  is_hidden: boolean;
  slot: number;
}

// ─── Moves ──────────────────────────────────────────────────────────────────

/** A reference to a move in the PokéAPI (name + url). */
export interface MoveReference {
  name: string;
  url: string;
}

/** An entry in a Pokemon's move list, with version details. */
export interface PokemonMoveEntry {
  move: MoveReference;
  version_group_details: VersionGroupDetail[];
}

export interface VersionGroupDetail {
  level_learned_at: number;
  move_learn_method: MoveLearnMethod;
  order?: number;
  version_group: VersionGroup;
}

export interface MoveLearnMethod {
  name: string;
  url: string;
}

export interface VersionGroup {
  name: string;
  url: string;
}

// ─── General ────────────────────────────────────────────────────────────────

export interface Cries {
  latest: string;
  legacy: string;
}

export interface Form {
  name: string;
  url: string;
}

export interface GameIndex {
  game_index: number;
  version: Version;
}

export interface Version {
  name: string;
  url: string;
}

export interface Generation {
  name: string;
  url: string;
}

export interface Species {
  name: string;
  url: string;
}

// ─── Stats & Types ──────────────────────────────────────────────────────────

export interface Stat {
  base_stat: number;
  effort: number;
  stat: StatDetail;
}

export interface StatDetail {
  name: string;
  url: string;
}

export interface PokemonType {
  slot: number;
  type: TypeDetail;
}

export interface TypeDetail {
  name: string;
  url: string;
}

// ─── Sprites ────────────────────────────────────────────────────────────────

export interface Sprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
  other: OtherSprites;
  versions: VersionSprites;
}

export interface OtherSprites {
  dream_world: DreamWorldSprites;
  home: HomeSprites;
  'official-artwork': OfficialArtworkSprites;
  showdown: ShowdownSprites;
}

export interface DreamWorldSprites {
  front_default: string;
  front_female: any;
}

export interface HomeSprites {
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface OfficialArtworkSprites {
  front_default: string;
  front_shiny: string;
}

export interface ShowdownSprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface VersionSprites {
  'generation-i': GenerationISprites;
  'generation-ii': GenerationIiSprites;
  'generation-iii': GenerationIiiSprites;
  'generation-iv': GenerationIvSprites;
  'generation-v': GenerationVSprites;
  'generation-vi': GenerationViSprites;
  'generation-vii': GenerationViiSprites;
  'generation-viii': GenerationViiiSprites;
}

// ─── Generation-specific Sprite Interfaces ──────────────────────────────────

export interface GenerationISprites {
  'red-blue': RedBlueSprites;
  yellow: YellowSprites;
}

export interface RedBlueSprites {
  back_default: string;
  back_gray: string;
  back_transparent: string;
  front_default: string;
  front_gray: string;
  front_transparent: string;
}

export interface YellowSprites {
  back_default: string;
  back_gray: string;
  back_transparent: string;
  front_default: string;
  front_gray: string;
  front_transparent: string;
}

export interface GenerationIiSprites {
  crystal: CrystalSprites;
  gold: GoldSprites;
  silver: SilverSprites;
}

export interface CrystalSprites {
  back_default: string;
  back_shiny: string;
  back_shiny_transparent: string;
  back_transparent: string;
  front_default: string;
  front_shiny: string;
  front_shiny_transparent: string;
  front_transparent: string;
}

export interface GoldSprites {
  back_default: string;
  back_shiny: string;
  front_default: string;
  front_shiny: string;
  front_transparent: string;
}

export interface SilverSprites {
  back_default: string;
  back_shiny: string;
  front_default: string;
  front_shiny: string;
  front_transparent: string;
}

export interface GenerationIiiSprites {
  emerald: EmeraldSprites;
  'firered-leafgreen': FireredLeafgreenSprites;
  'ruby-sapphire': RubySapphireSprites;
}

export interface EmeraldSprites {
  front_default: string;
  front_shiny: string;
}

export interface FireredLeafgreenSprites {
  back_default: string;
  back_shiny: string;
  front_default: string;
  front_shiny: string;
}

export interface RubySapphireSprites {
  back_default: string;
  back_shiny: string;
  front_default: string;
  front_shiny: string;
}

export interface GenerationIvSprites {
  'diamond-pearl': DiamondPearlSprites;
  'heartgold-soulsilver': HeartgoldSoulsilverSprites;
  platinum: PlatinumSprites;
}

export interface DiamondPearlSprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface HeartgoldSoulsilverSprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface PlatinumSprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface GenerationVSprites {
  'black-white': BlackWhiteSprites;
}

export interface BlackWhiteSprites {
  animated: AnimatedSprites;
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface AnimatedSprites {
  back_default: string;
  back_female: any;
  back_shiny: string;
  back_shiny_female: any;
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface GenerationViSprites {
  'omegaruby-alphasapphire': OmegarubyAlphasapphireSprites;
  'x-y': XYSprites;
}

export interface OmegarubyAlphasapphireSprites {
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface XYSprites {
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface GenerationViiSprites {
  icons: IconSprites;
  'ultra-sun-ultra-moon': UltraSunUltraMoonSprites;
}

export interface IconSprites {
  front_default: string;
  front_female: any;
}

export interface UltraSunUltraMoonSprites {
  front_default: string;
  front_female: any;
  front_shiny: string;
  front_shiny_female: any;
}

export interface GenerationViiiSprites {
  icons: IconSprites;
}
