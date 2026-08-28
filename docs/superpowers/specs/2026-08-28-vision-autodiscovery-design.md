# Autodescubrimiento de visión — diseño

**Fecha:** 2026-08-28 · **Versión objetivo:** v1.5.0 (feat → minor) · **Estado:** DRAFT

## Problema

1. **A — Inferencia innecesaria.** Con `OPENCODE_VISION_AUTO_MODE=append` (default actual), el
   plugin auto-describe toda imagen entrante (pegado en `chat.message`, captura en
   `tool.execute.after`) usando la cadena local-primero, incluso cuando el modelo principal
   ya tiene visión. El modelo local corre sin necesidad.
2. **B — Backends hardcodeados.** La cadena de backends es fija
   (`local → zen free → zen paid`, `vision.ts:297-324`). No descubre los modelos con visión
   ya configurados en los providers; `OPENCODE_VISION_LOCAL_MODEL` es el único punto de
   variación local.

## Objetivos

- **A:** detectar si el modelo principal de la sesión tiene capacidad de imagen
  (`Model.capabilities.input.image`) y, si es así, no ejecutar el backend de visión para
  auto-describir.
- **B:** descubrir modelos con visión entre los providers configurados
  (`client.provider.list()`) y usarlos como backends ordenados, con los tiers zen como
  fallback garantizado.

## No-objetivos / anti-criterios

- No introducir una abstracción completa de adapters por familia de API (fuera de scope;
  roadmap v2.x).
- No añadir proveedores cloud nuevos (Gemini, OpenAI, Anthropic, ...). Solo familia
  OpenAI-compatible + zen existente.
- No descubrir en cada llamada ni bloquear el arranque del plugin.
- No cambiar el comportamiento para modelos sin visión: `auto ≡ append` cuando no hay visión.
- No enviar la imagen a un proveedor sin capacidad de imagen verificada.
- No exponer credenciales de providers en logs/errores.

## Arquitectura

```
vision.ts                    hooks + tools (sin lógica de backends)
  ├─ chat.params ──────────► main-model-capability.ts   (track visión por sesión)
  ├─ chat.message / tool.execute.after ── decide auto-describe
  └─ vision tool ──────────► backend-discovery.ts       (candidatos + caché + orden)
```

Tres unidades con una responsabilidad cada una, testeables aisladas.

## Componentes

### `main-model-capability.ts`

- Función pura `hasImageCapability(model): boolean` → `model.capabilities.input.image`.
- `ModelVisionTracker`: `Map<sessionID, boolean>`.
  - Default desconocido = `false` (asume sin visión → describe; seguro).
  - Cap 100 sesiones (evicción FIFO, mismo patrón que `imagesBySession`).
  - Métodos: `track(model, sessionID)`, `hasVision(sessionID): boolean`.

### `backend-discovery.ts`

- `discover(client): BackendCandidate[]`:
  - `await client.provider.list()`
  - Filtrar `model.capabilities.input.image === true`.
  - Solo familia OpenAI-compatible: llamar con `${model.api.url}/chat/completions`.
    Detección sin sondeo previo: si el endpoint rechaza la llamada (404/405/400), el
    candidato falla y la cadena pasa al siguiente. zen cubre cloud.
  - `BackendCandidate = { providerID, model, name }`.
- Orden (local-first → gratis → coste):
  1. **local** = `model.api.url` con host de loopback (`localhost`, `127.0.0.1`, `::1`)
     o provider local conocido (ollama, lmstudio, llama, vllm).
  2. **gratis** = `model.cost.input === 0 && model.cost.output === 0`.
  3. resto por `cost.input` ascendente, luego `name`.
  - Tie-break estable: `name` lexicográfico.
- `OPENCODE_VISION_LOCAL_MODEL` / `OPENCODE_VISION_LOCAL_URL` = pin override:
  sintetizar candidato[0] fijo, el resto de discovery va después.
- Caché módulo-nivel `{ at, candidates }`, TTL constante `10 min` (sin env nuevo).
- `getCandidates(client)`: devuelve caché si fresca, si no `discover()`.
- Auth: si el provider tiene `key` y la familia es OpenAI-compatible → `Authorization: Bearer <key>`.
  Local sin key → sin header.

### `vision.ts` — cambios

- Nuevo hook `chat.params`: `track(input.model, input.sessionID)` (index.d.ts:203-215
  expone `model: Model`).
- Decisión auto-describe (compartida por `chat.message` y `tool.execute.after`):
  - `off` → nunca.
  - `append` / `replace` → siempre (**env manda**).
  - `auto` (nuevo default) → si `hasVision(sessionID) === true` skip (imagen nativa);
    si no → `append`.
- `describe()`: candidatos descubiertos en orden → si todos fallan, tiers zen (free + paid)
  garantizados → si todos fallan, error agregado y **limpieza de caché** (retry re-descubre).
- `vision tool` manual: siempre disponible; si el modelo principal ve, la usa solo si la
  pide explícitamente.

## Flujo de datos

1. Plugin load → `client` del factory (PluginInput).
2. Imagen entrante (pegado o captura) → decisión (off/append/replace/auto).
3. Si describe → `getCandidates(client)` (lazy en primer uso, TTL 10 min).
4. Probar candidatos en orden; cada fallo → siguiente.
5. Si fallan todos → zen free → zen paid.
6. Si fallan todos → error agregado + limpieza de caché.
7. Modelo cambia a mitad de sesión → `chat.params` actualiza el tracker por mensaje → la
   decisión se auto-adapta.

## Manejo de errores

- `client.provider.list()` falla → log + fallback a pin local + zen (comportamiento actual).
  Nunca rompe el auto-describe.
- Candidato individual falla → siguiente candidato.
- Ningún modelo con visión descubierto → zen (comportamiento actual).
- Descubrimiento best-effort: nunca bloquea el flujo de imagen.

## Configuración

| Variable | Antes | Después |
|----------|-------|---------|
| `OPENCODE_VISION_AUTO_MODE` | default `append` | default `auto`; valores válidos `append` / `replace` / `off` / `auto` |

Sin variables nuevas. TTL de discovery constante (10 min).

## Testing (bun test)

- `main-model-capability.test.ts`:
  - `hasImageCapability` true/false.
  - Tracker por sesión; default desconocido → `false`.
  - Cap de evicción (100).
- `backend-discovery.test.ts` (client mockeado, fixture `provider.list`):
  - Filtrado: modelo sin `capabilities.input.image` excluido.
  - Orden: local → gratis → coste.
  - Pin env (`OPENCODE_VISION_LOCAL_MODEL`) → candidato[0].
  - TTL: segunda llamada dentro de TTL no re-fetch.
  - `provider.list()` falla → lista vacía (no lanza).
- `vision.test.ts`: `describe()` con client inyectado — fallo de todos los candidatos →
  zen fallback; fallo total → error agregado + caché limpia.
- Sin red en tests: discovery abstraído por client mockeado, sin HTTP real.

## Docs / versionado

- README: tabla de configuración (`auto` + default), sección A+B.
- ROADMAP: mover items v1.2.0/v1.1.0 desactualizados; marcar autodescubrimiento.
- CHANGELOG: entrada `Unreleased` → `feat`.
- Release: v1.5.0 (minor).

## Criterios de aceptación

1. Modelo principal con `capabilities.input.image=true` y `AUTO_MODE=auto` → ninguna
   llamada a backend en auto-describe (imagen nativa).
2. Modelo principal sin visión y `AUTO_MODE=auto` → se inyecta descripción (`≡ append`).
3. `AUTO_MODE=append/replace` explícito → describe siempre, aunque el principal vea.
4. `AUTO_MODE=off` → nunca describe; `vision` manual sigue disponible.
5. Discovery filtra solo `capabilities.input.image=true`; familia OpenAI-compatible
   con fallback de cadena si el endpoint rechaza `/chat/completions`.
6. Orden de candidatos: local → gratis → coste.
7. `OPENCODE_VISION_LOCAL_MODEL` → candidato[0] fijo.
8. Caché TTL 10 min; re-descubrimiento tras fallo total.
9. `provider.list()` falla → flujo de visión no se rompe (zen fallback).
10. `bun test` pasa (nuevos + existentes).
11. `bun run typecheck` (tsc --noEmit) pasa.
12. Ningún secreto en logs/errores.
