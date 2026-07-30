function hashSeed(value) {
  return Array.from(String(value)).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
}

function seededRandom(seed) {
  let state = seed || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export default function CardMotionBackdrop({ seed, variant = 'project' }) {
  const random = seededRandom(hashSeed(`${variant}:${seed}`));
  const pieceCount = variant === 'tool' ? 6 : 3;

  return (
    <span aria-hidden="true" className={`card-motion card-motion--${variant}`}>
      {Array.from({ length: pieceCount }, (_, index) => {
        const isMarker = variant === 'tool' && index % 3 === 0;
        const depth = random();

        return (
          <span
            className={`card-motion__piece${isMarker ? ' is-marker' : ''}`}
            key={`${seed}-${index}`}
            style={{
              '--motion-angle': `${Math.round(random() * 42 - 21)}deg`,
              '--motion-blur': `${((1 - depth) * 1.8).toFixed(2)}px`,
              '--motion-delay': `${(random() * -12).toFixed(2)}s`,
              '--motion-depth': depth.toFixed(2),
              '--motion-duration': `${(random() * 7 + 12).toFixed(2)}s`,
              '--motion-height': `${Math.round(48 + depth * 38)}px`,
              '--motion-length': `${Math.round(
                random() * 62 + (variant === 'tool' ? 26 : 104),
              )}px`,
              '--motion-opacity': (depth * .24 + .16).toFixed(2),
              '--motion-shift': `${Math.round(random() * 12 + 6)}px`,
              '--motion-x': `${Math.round(random() * 86 + 2)}%`,
              '--motion-y': `${Math.round(random() * 78 + 9)}%`,
            }}
          />
        );
      })}
    </span>
  );
}
