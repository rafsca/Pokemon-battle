/** Map of status condition names to their standard abbreviations. */
export const STATUS_ABBREVIATIONS: Record<string, string> = {
  paralysis:  'PAR',
  burn:       'BRN',
  poison:     'PSN',
  sleep:      'SLP',
  freeze:     'FRZ',
  confusion:  'CNF',
};

/** Target names that indicate the move affects the user (self). */
export const SELF_TARGETS: string[] = [
  'user',
  'user-and-allies',
  'users-field',
  'all-allies',
  'user-or-ally',
];

/** Target names that indicate the move affects the opponent. */
export const OPPONENT_TARGETS: string[] = [
  'selected-pokemon',
  'specific-move',
  'selected-pokemon-me-first',
  'opponent',
  'all-opponents',
  'all-other-pokemon',
  'random-opponent',
];
