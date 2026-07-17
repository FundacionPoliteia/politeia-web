# Politeia Brand System

Este directorio es la fuente de verdad visual para remodelar otras web-apps de Politeia.

## Archivos

- `politeia-brand-kit.html`: guia navegable para diseno, desarrollo y redes.
- `politeia-tokens.css`: variables CSS listas para importar en cualquier app web.
- `politeia-tokens.json`: tokens portables para Figma, Style Dictionary u otros pipelines.

## Uso en una web-app

Importar los tokens antes del resto de los estilos:

```css
@import "./path/to/politeia-tokens.css";
```

Luego usar variables semanticas o de marca:

```css
.button {
  background: var(--color-action);
  color: var(--blanco);
  border-radius: var(--radius-pill);
  font-family: var(--texto);
}
```

## Reglas rapidas

- `--tinta`: texto principal, fondos oscuros, acciones de maxima jerarquia.
- `--azul`: accion, links, iconos, estados activos.
- `--rosa`: detalles, badges y pequenos acentos. No usar como fondo dominante.
- `--hueso`: fondo general.
- `--blanco`: tarjetas, modales y superficies elevadas.
- `--gris`: metadatos, ayudas y texto secundario.

## Tipografia

- Fraunces para titulares, marca, citas y piezas editoriales.
- Archivo para texto, UI, botones, tablas y formularios.
- JetBrains Mono solo para codigo, tokens y muestras tecnicas.
