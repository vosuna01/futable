# MMR (beta) y cuotas según el MMR

Estado: **en pruebas**. El MMR se calcula en la app y está **visible en la web publicada** (pestaña, historial, directo y penalización), activado en `.github/workflows/pages.yml`. La migración `016_mmr_odds.sql` está **aplicada en producción desde el 24 de noviembre de 2026** (ver [ACTIVACION.md](ACTIVACION.md)): las cuotas de los mercados nuevos y el pronóstico de la web siguen el MMR.

## Qué hay

| Pieza                                                                   | Dónde                                                         | Toca la base de datos |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- |
| MMR (Elo por equipos)                                                   | `src/domain/mmr.ts`                                           | No                    |
| Penalización por regularidad (solo MMR mostrado)                        | `src/domain/mmr-penalty.ts`                                   | No                    |
| Pestaña «MMR (beta)», +/- en historial y MMR en juego en directo/tablet | `src/components/MmrRanking.tsx`, `History.tsx`, `LiveMmr.tsx` | No                    |
| Pronóstico de la pista según el MMR                                     | `src/domain/mmr-odds.ts`                                      | No                    |
| Cuotas de coins según el MMR                                            | `supabase/migrations/016_mmr_odds.sql`                        | **Sí**                |

El ranking por porcentaje de victorias no cambia en ningún caso.

## Cálculo

- Todos empiezan en 1000. Se recorren las partidas válidas de **todas las temporadas** por fecha y, si coincide, por id.
- Nivel del equipo = media del MMR de sus dos jugadores. `E = 1 / (1 + 10^((R_rival − R_propio) / 400))`.
- `Δ = K · (S − E)`, con K = 40 en las 10 primeras partidas del jugador y 24 después.
- Penalización: `2 × max(0, 40 − partidas en los últimos 28 días)` (hora de Madrid; proporcional los primeros días tras `startDate`). Solo resta al **MMR mostrado**; nunca a E, a Δ, al MMR interno ni a las cuotas.
- Cuota: probabilidad E limitada a [5 %, 95 %], margen del 8 %, mínimo 1,01 y dos decimales. Mismo formato que la 013; sin historial, 1,85.

## Flags

| Variable                   | Por defecto                              | Efecto                                                                   |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `VITE_MMR_ENABLED`         | activo en `pnpm dev`, inactivo en la web | Pestaña MMR, +/- del historial, MMR en juego en directo                  |
| `VITE_MMR_PENALTY_ENABLED` | igual                                    | Penalización por regularidad en el MMR mostrado                          |
| `VITE_MMR_ODDS_ENABLED`    | sigue a `VITE_MMR_ENABLED`               | Porcentaje del «Pronóstico de la pista» y cuotas de la demo según el MMR |

Con los flags en `false` la app funciona exactamente igual que antes. La web publicada (GitHub Pages) los fija en el paso `pnpm build` de `.github/workflows/pages.yml`: los tres a `true`. Para ocultar el MMR en la web, poned los dos primeros a `false` y haced push; `VITE_MMR_ODDS_ENABLED` debe seguir a `true` mientras la 016 esté aplicada.

## Aplicar la 016 en producción

1. Revisar `supabase/migrations/016_mmr_odds.sql` y ejecutar `pnpm test` (incluye `tests/mmr-odds-database.test.ts`, que comprueba en PostgreSQL embebido que el servidor da el mismo MMR y las mismas cuotas que la app).
2. Aplicarla **una sola vez**, después de la 015, en el editor SQL de Supabase. Es transaccional.
3. Cambiar `VITE_MMR_ODDS_ENABLED` a `"true"` en `.github/workflows/pages.yml` y hacer push. Si no, el porcentaje del pronóstico seguiría el modelo anterior mientras las cuotas siguen el MMR.

Qué cambia y qué no:

- Solo cambia `_coin_odds`, la función que usan los triggers de la 013 al crear cada mercado. El modelo anterior queda guardado como `_coin_odds_winrate`.
- Las apuestas ya aceptadas conservan su cuota. Un mercado ya abierto mantiene sus cuotas; el siguiente sale con el MMR.
- No modifica partidas, apuestas, saldos ni permisos. Las funciones nuevas no son accesibles para los clientes.
- Coste: cada mercado nuevo recorre el historial de la liga (cientos de partidas: milisegundos). Si la liga crece mucho, se puede guardar el MMR en una tabla.

## Volver al modelo anterior

```sql
create or replace function public._coin_odds(sid uuid, sig jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public._coin_odds_winrate(sid, sig)
$$;
```

Y publicar el cliente con `VITE_MMR_ODDS_ENABLED=false`.
