-- Virtual points: server-priced, fixed decimal odds. No monetary value.
begin;
alter table public.coin_markets add column odds jsonb;
alter table public.coin_bets add column odds numeric(6,2) check(odds between 1.01 and 18.52);

-- Same season / post / pair model as domain/odds.ts, using trusted DB history.
create function public._coin_odds(sid uuid,sig jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.seasons; side text; post text; pid uuid; ids uuid[]; games bigint; wins bigint;
 solo numeric; pair_score numeric; weight numeric; strength numeric[]:='{}'; share numeric;
begin
 select * into strict s from public.seasons where id=sid;
 foreach side in array array['red','blue'] loop
  ids:=array[(sig#>>array[side,'0'])::uuid,(sig#>>array[side,'1'])::uuid]; solo:=0;
  foreach post in array array['defender','forward'] loop
   pid:=ids[case when post='defender' then 1 else 2 end];
   select count(*),count(*) filter(where mp.team=m.winner) into games,wins
   from public.matches m join public.match_participants mp on mp.match_id=m.id
   where m.league_id=s.league_id and m.season_id=s.id and m.status='valid' and mp.player_id=pid and mp.position=post;
   solo:=solo+100*(wins+s.prior_wins)/(games+s.prior_games)/2;
  end loop;
  select count(*),count(*) filter(where a.team=m.winner) into games,wins
  from public.matches m join public.match_participants a on a.match_id=m.id and a.player_id=ids[1]
  join public.match_participants b on b.match_id=m.id and b.player_id=ids[2] and b.team=a.team
  where m.league_id=s.league_id and m.season_id=s.id and m.status='valid';
  pair_score:=100*(wins+s.prior_wins)/(games+s.prior_games);
  weight:=games::numeric/(games+s.pair_minimum)*0.5;
  strength:=array_append(strength,solo*(1-weight)+pair_score*weight);
 end loop;
 share:=greatest(0.05,least(0.95,coalesce(strength[1]/nullif(strength[1]+strength[2],0),0.5)));
 return jsonb_build_object('red',greatest(1.01,round(1/(share*1.08),2)),
 'blue',greatest(1.01,round(1/((1-share)*1.08),2)));
end $$;
create function public._coin_price_market() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 new.odds:=public._coin_odds(new.season_id,new.signature); return new;
end $$;
create trigger coin_price_market before insert on public.coin_markets for each row execute function public._coin_price_market();
create function public._coin_price_bet() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 select (m.odds->>new.team)::numeric into new.odds from public.coin_markets m where m.id=new.market_id;
 if new.odds is null then raise exception 'Actualiza la aplicación para apostar con cuotas'; end if;
 return new;
end $$;
create trigger coin_price_bet before insert on public.coin_bets for each row execute function public._coin_price_bet();

create or replace function public._coin_return(m uuid,cancelled boolean,win text) returns void
language plpgsql security definer set search_path='' as $$ declare b record; pool bigint; backed bigint; desired bigint; begin
 select coalesce(sum(stake),0),coalesce(sum(stake) filter(where team=win),0) into pool,backed from public.coin_bets where market_id=m;
 for b in select * from public.coin_bets where market_id=m order by wallet_id loop
  desired:=case when cancelled then b.stake when b.team<>win or win is null then 0
   when b.odds is not null then floor(b.stake*b.odds)::bigint
   when backed>0 then (b.stake::bigint*pool)/backed else 0 end;
  perform public._coin_delta(b.wallet_id,desired-b.returned,case when cancelled then 'refund' else 'payout' end,m);
  update public.coin_bets set returned=desired where id=b.id;
 end loop;
 update public.coin_markets set status=case when cancelled then 'cancelled' else 'settled' end,winner=win where id=m;
end $$;

-- Preserve the existing authorization, escrow, retries and command implementation.
alter function public.coins_command(uuid,text,jsonb) rename to _coins_command_before_fixed_odds;
revoke all on function public._coins_command_before_fixed_odds(uuid,text,jsonb) from public,anon,authenticated;
create function public.coins_command(p_league uuid,p_action text,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$ declare quote numeric; begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league for update;
 if p_action='bet' then
  select (odds->>(p_input->>'team'))::numeric into quote from public.coin_markets
   where id=(p_input->>'market_id')::uuid and league_id=p_league;
  if quote is null or (p_input->>'expected_odds')::numeric is distinct from quote then
   raise exception 'La cuota ha cambiado. Actualiza la aplicación y revisa la apuesta';
  end if;
 end if;
 perform public._coins_command_before_fixed_odds(p_league,p_action,p_input);
end $$;
revoke all on function public.coins_command(uuid,text,jsonb) from public,anon;
grant execute on function public.coins_command(uuid,text,jsonb) to authenticated;
revoke all on function public._coin_odds(uuid,jsonb),public._coin_price_market(),public._coin_price_bet() from public,anon,authenticated;

-- Pending legacy tickets are refunded, not reinterpreted. Settled history stays intact.
do $$ declare r record; begin
 for r in select id from public.coin_markets where status in ('open','locked') loop
  perform public._coin_return(r.id,true,null);
 end loop;
 for r in select id from public.live_sessions where status='active' loop perform public._coin_live_sync(r.id); end loop;
end $$;
commit;
