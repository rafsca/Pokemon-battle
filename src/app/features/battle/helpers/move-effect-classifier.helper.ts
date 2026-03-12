import { SelectedMove } from '../../../core/models/move.model';

export interface MoveBehavior {
  isTrap: boolean;
  trapTurnsMin: number | null;
  trapTurnsMax: number | null;
  trapResidualFraction: number | null;
  isHpEqualizingDamage: boolean;
  fixedPowerFromHappiness: number | null;
  isProtectLike: boolean;
  requiresChargeTurn: boolean;
  requiresRechargeTurn: boolean;
  isSleepOnly: boolean;
  drainPercent: number;
  recoilPercent: number;
  isLeechSeedLike: boolean;
}

/**
 * Classifies move behavior with a hybrid strategy:
 * - Structured PokéAPI fields first (`meta`, `damage_class`, `name`)
 * - English effect text keyword matching as fallback
 */
export function analyzeMoveBehavior(move: SelectedMove): MoveBehavior {
  const text = buildNormalizedEffectText(move);
  const ailment = move.meta?.ailment?.name ?? '';

  const isTrap = ailment === 'trap'
    || hasAny(text, [
      'cannot leave the field',
      'prevents the target from fleeing',
      'inflicts damage for 2-5 turns',
      'for the next 2-5 turns',
    ]);

  const isProtectLike = move.damage_class?.name === 'status' && (
    hasAny(text, [
      'no moves will hit the user for the remainder of this turn',
      'prevents any moves from hitting the user this turn',
      'prevents moves from hitting the user this turn',
    ])
    || [
      'protect',
      'detect',
      'quick-guard',
      'wide-guard',
      'spiky-shield',
      'kings-shield',
      'baneful-bunker',
      'obstruct',
      'silk-trap',
      'burning-bulwark',
    ].includes(move.name?.toLowerCase() ?? '')
  );

  const requiresChargeTurn = hasAny(text, [
    'requires a turn to charge before attacking',
    'charges on first turn and attacks on second',
    'attacks on the second turn',
  ]);

  const requiresRechargeTurn = hasAny(text, [
    'user foregoes its next turn to recharge',
    'must recharge on the following turn',
    'must recharge next turn',
  ]);

  const isSleepOnly = hasAny(text, [
    'only works on sleeping pokemon',
    'only works on sleeping pokémon',
    'fails if the target is not asleep',
  ]);

  const { drainPercent, recoilPercent } = getDrainAndRecoilPercent(move, text);

  const isHpEqualizingDamage = hasAny(text, [
    'lowers the target s hp to equal the user s',
    'inflicts exactly enough damage to lower the target s hp to equal the user s',
  ]);

  const fixedPowerFromHappiness = hasAny(text, [
    'power increases with happiness',
    'power increases as happiness decreases',
  ]) ? 102 : null;

  const isLeechSeedLike = hasAny(text, [
    'seeds the target',
    'stealing hp from it every turn',
    'drains 1/8 of its max hp at the end of every turn',
  ]) || move.name?.toLowerCase() === 'leech-seed';

  return {
    isTrap,
    trapTurnsMin: move.meta?.min_turns ?? null,
    trapTurnsMax: move.meta?.max_turns ?? null,
    trapResidualFraction: parseEndTurnFraction(text) ?? (isTrap ? 1 / 16 : null),
    isHpEqualizingDamage,
    fixedPowerFromHappiness,
    isProtectLike,
    requiresChargeTurn,
    requiresRechargeTurn,
    isSleepOnly,
    drainPercent,
    recoilPercent,
    isLeechSeedLike,
  };
}

function buildNormalizedEffectText(move: SelectedMove): string {
  const englishEntries = (move.effect_entries ?? [])
    .filter(entry => entry.language?.name === 'en')
    .map(entry => `${entry.short_effect ?? ''} ${entry.effect ?? ''}`)
    .join(' ');

  const fullText = `${move.shortEffect ?? ''} ${englishEntries}`;
  return normalize(fullText);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/é/g, 'e')
    .replace(/–/g, '-')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(normalize(keyword)));
}

function parseEndTurnFraction(text: string): number | null {
  const fractionMatch = text.match(/(\d+)\/(\d+)\s+its\s+max\s+hp\s+at\s+the\s+end\s+of\s+(every|each)\s+turn/);
  if (!fractionMatch) return null;

  const numerator = Number(fractionMatch[1]);
  const denominator = Number(fractionMatch[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;

  return numerator / denominator;
}

function getDrainAndRecoilPercent(move: SelectedMove, text: string): { drainPercent: number; recoilPercent: number } {
  const drainFromMeta = move.meta?.drain ?? 0;
  if (drainFromMeta > 0) {
    return { drainPercent: drainFromMeta, recoilPercent: 0 };
  }

  if (drainFromMeta < 0) {
    return { drainPercent: 0, recoilPercent: Math.abs(drainFromMeta) };
  }

  if (hasAny(text, ['drains half the damage inflicted to heal the user'])) {
    return { drainPercent: 50, recoilPercent: 0 };
  }
  if (hasAny(text, ['drains three quarters of the damage inflicted'])) {
    return { drainPercent: 75, recoilPercent: 0 };
  }

  if (hasAny(text, ['user receives 1/4 the damage it inflicts in recoil'])) {
    return { drainPercent: 0, recoilPercent: 25 };
  }

  return { drainPercent: 0, recoilPercent: 0 };
}
