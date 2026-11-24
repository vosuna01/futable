-- Cuotas de coins según el MMR (Elo por equipos). PENDIENTE DE REVISIÓN:
-- no aplicar en producción sin revisarla aparte (ver docs/MMR-CUOTAS.md).
--
-- Replica en SQL el cálculo de src/domain/mmr.ts (modo A, historial completo):
--   · todos empiezan en 1000; partidas válidas de TODAS las temporadas de la
--     liga, por orden de played_at y, si coincide, id;
--   · nivel del equipo = media del MMR de sus dos jugadores;
--   · E_azul = 1 / (1 + 10^((R_rojo − R_azul) / 400)), E_rojo = 1 − E_azul;
--   · Δ = K · (S − E), K = 40 en las 10 primeras partidas del jugador y 24 después.
-- La penalización por regularidad NO interviene: solo cambia el MMR mostrado.
-- Los MMR se llevan en double precision, como en el cliente, para que ambos
-- lados den exactamente la misma cuota.
--
-- El precio sigue el formato de la 013: probabilidad limitada a [5 %, 95 %],
-- margen del 8 %, cuota mínima 1,01 y dos decimales. Sin historial, 1,85.
-- No toca partidas, apuestas aceptadas ni mercados ya abiertos: cada apuesta
-- conserva la cuota con la que se aceptó y el mercado siguiente ya sale con MMR.
begin;

-- El modelo anterior se conserva intacto para poder volver a él.
alter function public._coin_odds(uuid, jsonb) rename to _coin_odds_winrate;

-- MMR interno de cada jugador de la liga tras recorrer todo su historial.
create function public._mmr_ratings(p_league uuid)
returns table(player_id uuid, mmr double precision, games int)
language plpgsql stable security definer set search_path = '' as $$
declare
  m record;
  ids uuid[] := '{}';
  ratings double precision[] := '{}';
  played int[] := '{}';
  team_ids uuid[];
  blue_ids uuid[];
  red_ids uuid[];
  blue_level double precision;
  red_level double precision;
  e_blue double precision;
  pid uuid;
  side text;
  at int;
  next_ratings double precision[];
begin
  for m in
    select x.id, x.winner from public.matches x
    where x.league_id = p_league and x.status = 'valid'
    order by x.played_at, x.id
  loop
    select array_agg(mp.player_id order by mp.position) filter (where mp.team = 'blue'),
           array_agg(mp.player_id order by mp.position) filter (where mp.team = 'red')
      into blue_ids, red_ids
    from public.match_participants mp where mp.match_id = m.id;
    if m.winner is null or m.winner not in ('blue', 'red')
       or blue_ids is null or red_ids is null then
      raise exception 'La partida % no tiene ganador o equipos válidos', m.id;
    end if;
    -- Alta a 1000 de quien juega por primera vez.
    foreach pid in array blue_ids || red_ids loop
      if array_position(ids, pid) is null then
        ids := ids || pid;
        ratings := ratings || 1000::double precision;
        played := played || 0;
      end if;
    end loop;
    -- Media del equipo sumando en orden (defensa, delantero), como el cliente.
    blue_level := 0;
    foreach pid in array blue_ids loop
      blue_level := blue_level + ratings[array_position(ids, pid)];
    end loop;
    blue_level := blue_level / cardinality(blue_ids);
    red_level := 0;
    foreach pid in array red_ids loop
      red_level := red_level + ratings[array_position(ids, pid)];
    end loop;
    red_level := red_level / cardinality(red_ids);
    e_blue := 1 / (1 + power(10::double precision, (red_level - blue_level) / 400));
    -- Todos los Δ con los valores previos; después se aplican a la vez.
    next_ratings := ratings;
    foreach side in array array['blue', 'red'] loop
      team_ids := case when side = 'blue' then blue_ids else red_ids end;
      foreach pid in array team_ids loop
        at := array_position(ids, pid);
        next_ratings[at] := ratings[at]
          + (case when played[at] < 10 then 40 else 24 end)
            * ((case when side = m.winner then 1 else 0 end)
               - (case when side = 'blue' then e_blue else 1 - e_blue end));
        played[at] := played[at] + 1;
      end loop;
    end loop;
    ratings := next_ratings;
  end loop;
  return query
    select ids[i], ratings[i], played[i]
    from generate_subscripts(ids, 1) as g(i);
end $$;

-- Cuotas según el MMR. Misma firma y formato que la versión de la 013.
create function public._coin_odds_mmr(sid uuid, sig jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.seasons;
  ids uuid[];
  ratings double precision[];
  red_level double precision := 0;
  blue_level double precision := 0;
  i int;
  share double precision;
begin
  select * into strict s from public.seasons where id = sid;
  select coalesce(array_agg(x.player_id), '{}'), coalesce(array_agg(x.mmr), '{}')
    into ids, ratings
  from public._mmr_ratings(s.league_id) x;
  for i in 0..1 loop
    red_level := red_level + coalesce(
      ratings[array_position(ids, (sig #>> array['red', i::text])::uuid)], 1000);
    blue_level := blue_level + coalesce(
      ratings[array_position(ids, (sig #>> array['blue', i::text])::uuid)], 1000);
  end loop;
  red_level := red_level / 2;
  blue_level := blue_level / 2;
  -- Probabilidad de que gane el rojo, limitada como en la 013.
  share := greatest(0.05, least(0.95,
    1 / (1 + power(10::double precision, (blue_level - red_level) / 400))));
  return jsonb_build_object(
    'red', greatest(1.01, round((100 / (share * 1.08))::numeric) / 100),
    'blue', greatest(1.01, round((100 / ((1 - share) * 1.08))::numeric) / 100));
end $$;

-- Punto único que usan los triggers de la 013: ahora delega en el MMR.
-- Volver atrás: recrear esta función devolviendo _coin_odds_winrate(sid, sig).
create function public._coin_odds(sid uuid, sig jsonb)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._coin_odds_mmr(sid, sig)
$$;

revoke all on function public._mmr_ratings(uuid),
  public._coin_odds_mmr(uuid, jsonb),
  public._coin_odds(uuid, jsonb),
  public._coin_odds_winrate(uuid, jsonb)
  from public, anon, authenticated;
commit;
