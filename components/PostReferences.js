export default function PostReferences({ references = [], preview = false }) {
  const items = normalizeReferences(references);
  if (!items.length) return null;

  return (
    <section className={`post-references ${preview ? 'is-preview' : ''}`} aria-labelledby={preview ? undefined : 'post-references-title'}>
      <span className="eyebrow">Fuentes</span>
      <h2 id={preview ? undefined : 'post-references-title'}>Referencias</h2>
      <ol>
        {items.map((reference, index) => (
          <li key={`${reference.text}-${reference.url || index}`}>
            {reference.url ? (
              <a href={reference.url} rel="noopener noreferrer" target="_blank">
                {reference.text}
              </a>
            ) : reference.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((reference) => ({
      text: typeof reference?.text === 'string' ? reference.text.trim() : '',
      url: typeof reference?.url === 'string' ? reference.url.trim() : '',
    }))
    .filter((reference) => reference.text);
}
