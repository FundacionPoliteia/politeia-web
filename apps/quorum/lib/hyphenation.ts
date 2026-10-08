const softHyphen = '\u00ad';
const longWord = /\p{L}{13,}/gu;
const SpanishSuffixes = ['aciones', 'ación', 'izaciones', 'ización', 'imientos', 'imiento', 'amientos', 'amiento', 'idades', 'idad', 'mente', 'ismos', 'ismo', 'istas', 'ista'];

function softHyphenateWord(word: string) {
  if (word.includes(softHyphen)) return word;

  const normalized = word.toLocaleLowerCase('es-AR');
  const suffix = SpanishSuffixes.find((candidate) => normalized.endsWith(candidate) && word.length - candidate.length >= 7);
  if (suffix) {
    const breakAt = word.length - suffix.length;
    return `${word.slice(0, breakAt)}${softHyphen}${word.slice(breakAt)}`;
  }

  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += 12) chunks.push(word.slice(index, index + 12));
  return chunks.join(softHyphen);
}

/**
 * Adds optional, visible-on-wrap hyphens to long glossary words.
 * The underlying editorial term and its accessible label remain unchanged.
 */
export function softHyphenate(value: string) {
  return value.replace(longWord, softHyphenateWord);
}
