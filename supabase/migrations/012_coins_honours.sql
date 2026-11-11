-- Virtual points only. Existing match / live RPCs retain their behaviour.
begin;
create table public.coin_settings (
 league_id uuid primary key references public.leagues, enabled boolean not null default true,
 initial int not null default 100 check(initial between 0 and 10000),
 win_bonus int not null default 5 check(win_bonus between 0 and 100),
 max_stake int not null default 25 check(max_stake between 1 and 1000),
 starts_at timestamptz not null default now()
);
insert into public.coin_settings(league_id) select id from public.leagues;
create table public.coin_wallets (
 id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues,
 season_id uuid not null, player_id uuid not null, balance bigint not null default 0,
 unique(season_id,player_id), foreign key(league_id,season_id) references public.seasons(league_id,id),
 foreign key(league_id,player_id) references public.players(league_id,id)
);
create table public.coin_ledger (
 id uuid primary key default gen_random_uuid(), wallet_id uuid not null references public.coin_wallets,
 amount bigint not null, reason text not null, reference_id uuid, created_at timestamptz not null default now()
);
create index on public.coin_ledger(wallet_id,created_at desc);
create table public.coin_markets (
 id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues,
 season_id uuid not null references public.seasons, session_id uuid not null references public.live_sessions,
 round int not null, signature jsonb not null, status text not null check(status in ('open','locked','settled','cancelled')),
 match_id uuid unique references public.matches, winner text check(winner in ('red','blue')),
 created_at timestamptz not null default now()
);
create unique index coin_one_market on public.coin_markets(session_id) where status in ('open','locked');
create table public.coin_bets (
 id uuid primary key default gen_random_uuid(), market_id uuid not null references public.coin_markets,
 wallet_id uuid not null references public.coin_wallets, team text not null check(team in ('red','blue')),
 stake int not null check(stake>0), returned bigint not null default 0,
 created_at timestamptz not null default now(), unique(market_id,wallet_id)
);
create table public.coin_rewards (
 match_id uuid not null references public.matches, wallet_id uuid not null references public.coin_wallets,
 amount int not null default 0, rate int not null, primary key(match_id,wallet_id)
);
create table public.coin_actions (
 id uuid primary key, league_id uuid not null references public.leagues, actor_id uuid not null references auth.users,
 payload jsonb not null, created_at timestamptz not null default now()
);
create table public.season_honours (
 season_id uuid primary key references public.seasons, league_id uuid not null references public.leagues,
 awards jsonb not null, published_by uuid not null references auth.users, published_at timestamptz not null default now()
);
-- Access is exclusively through guarded RPCs; no client can write a balance or ledger.
do $$ declare t text; begin
 foreach t in array array['coin_settings','coin_wallets','coin_ledger','coin_markets','coin_bets','coin_rewards','coin_actions','season_honours'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

create function public._coin_delta(w uuid,n bigint,r text,ref uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if n=0 then return; end if;
 update public.coin_wallets set balance=balance+n where id=w;
 insert into public.coin_ledger(wallet_id,amount,reason,reference_id) values(w,n,r,ref);
end $$;
create function public._coin_wallet(l uuid,s uuid,p uuid) returns uuid
language plpgsql security definer set search_path='' as $$ declare w uuid; n int; begin
 select id into w from public.coin_wallets where season_id=s and player_id=p;
 if w is null then
  select initial into n from public.coin_settings where league_id=l;
  insert into public.coin_wallets(league_id,season_id,player_id) values(l,s,p) returning id into w;
  perform public._coin_delta(w,coalesce(n,100),'welcome',s);
 end if; return w;
end $$;
create function public._coin_signature(st jsonb,target int) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('red',jsonb_build_array(st#>>'{court,red,defender,id}',st#>>'{court,red,forward,id}'),
 'blue',jsonb_build_array(st#>>'{court,blue,defender,id}',st#>>'{court,blue,forward,id}'),
 'target',coalesce((st->>'target')::int,target))
$$;
create function public._coin_return(m uuid,cancelled boolean,win text) returns void
language plpgsql security definer set search_path='' as $$ declare b record; pool bigint; backed bigint; desired bigint; begin
 select coalesce(sum(stake),0),coalesce(sum(stake) filter(where team=win),0) into pool,backed from public.coin_bets where market_id=m;
 for b in select * from public.coin_bets where market_id=m order by wallet_id loop
  desired:=case when cancelled then b.stake when b.team=win and backed>0 then (b.stake::bigint*pool)/backed else 0 end;
  perform public._coin_delta(b.wallet_id,desired-b.returned,case when cancelled then 'refund' else 'payout' end,m);
  update public.coin_bets set returned=desired where id=b.id;
 end loop;
 update public.coin_markets set status=case when cancelled then 'cancelled' else 'settled' end,winner=win where id=m;
end $$;
create function public._coin_match(mid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.matches; cfg public.coin_settings; mk public.coin_markets; r record; p record; w uuid; desired int; sig jsonb;
begin
 select * into m from public.matches where id=mid;
 select * into cfg from public.coin_settings where league_id=m.league_id;
 -- Never backfill historic wins. The timestamp is frozen when coins are activated.
 if m.created_at<cfg.starts_at or cfg.league_id is null then return; end if;
 if cfg.enabled then
  for p in select player_id from public.match_participants where match_id=mid and team=m.winner and m.status='valid' loop
   w:=public._coin_wallet(m.league_id,m.season_id,p.player_id);
   insert into public.coin_rewards(match_id,wallet_id,rate) values(mid,w,coalesce((select max(rate) from public.coin_rewards where match_id=mid),cfg.win_bonus)) on conflict do nothing;
  end loop;
 end if;
 for r in select cr.*,cw.player_id from public.coin_rewards cr join public.coin_wallets cw on cw.id=cr.wallet_id where cr.match_id=mid loop
  desired:=case when m.status='valid' and exists(select 1 from public.match_participants where match_id=mid and player_id=r.player_id and team=m.winner) then r.rate else 0 end;
  perform public._coin_delta(r.wallet_id,desired-r.amount,'win',mid);
  update public.coin_rewards set amount=desired where match_id=mid and wallet_id=r.wallet_id;
 end loop;
 select * into mk from public.coin_markets where match_id=mid;
 if mk.id is not null then
  select jsonb_build_object('red',jsonb_build_array(
   (select player_id from public.match_participants where match_id=mid and team='red' and position='defender'),
   (select player_id from public.match_participants where match_id=mid and team='red' and position='forward')),
   'blue',jsonb_build_array(
   (select player_id from public.match_participants where match_id=mid and team='blue' and position='defender'),
   (select player_id from public.match_participants where match_id=mid and team='blue' and position='forward')),
   'target',mk.signature->'target') into sig;
  -- A changed lineup invalidates the original wager, permanently.
  perform public._coin_return(mk.id,m.status='void' or sig<>mk.signature or mk.status='cancelled',m.winner);
 end if;
end $$;

create function public._coin_live_sync(sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.live_sessions; mk public.coin_markets; cfg public.coin_settings; target int; sig jsonb; locked boolean;
begin
 select * into s from public.live_sessions where id=sid;
 select * into cfg from public.coin_settings where league_id=s.league_id;
 select seasons.target into target from public.seasons where id=s.season_id;
 sig:=public._coin_signature(s.state,target);
 select * into mk from public.coin_markets where session_id=sid and status in ('open','locked');
 if mk.id is not null and (not coalesce(cfg.enabled,false) or s.status<>'active' or s.state->'court'='null'::jsonb or
   mk.signature<>sig or mk.round<>(s.state->>'round')::int) then
  perform public._coin_return(mk.id,true,null); mk.id:=null;
 end if;
 if not coalesce(cfg.enabled,false) or s.status<>'active' or s.state->'court'='null'::jsonb or s.state->'court' is null then return; end if;
 locked:=greatest(coalesce((s.state#>>'{goals,red}')::int,0),coalesce((s.state#>>'{goals,blue}')::int,0)) >= (sig->>'target')::int;
 if mk.id is null then
  insert into public.coin_markets(league_id,season_id,session_id,round,signature,status)
   values(s.league_id,s.season_id,sid,(s.state->>'round')::int,sig,case when locked then 'locked' else 'open' end);
 else update public.coin_markets set status=case when locked then 'locked' else 'open' end where id=mk.id; end if;
end $$;
create function public._coin_live_trigger() returns trigger
language plpgsql security definer set search_path='' as $$ declare mk uuid; begin
 if tg_op='UPDATE' and new.last_match is not null and new.last_match is distinct from old.last_match and
   (new.state->>'round')::int>(old.state->>'round')::int then
  select id into mk from public.coin_markets where session_id=new.id and status in ('open','locked');
  if mk is not null then
   update public.coin_markets set match_id=new.last_match,status='settled' where id=mk;
   perform public._coin_match(new.last_match);
  end if;
 end if;
 perform public._coin_live_sync(new.id); return new;
end $$;
create trigger coins_live after insert or update on public.live_sessions for each row execute function public._coin_live_trigger();

-- Wrap, rather than copy, the existing implementations (including Pol's live flow).
alter function public.save_match(uuid,jsonb,uuid,int,text) rename to _save_match_before_coins;
revoke all on function public._save_match_before_coins(uuid,jsonb,uuid,int,text) from public,anon,authenticated;
create function public.save_match(p_league uuid,p_input jsonb,p_match uuid default null,p_revision int default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare mid uuid; begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league for update;
 perform set_config('futable.coin_defer','1',true);
 mid:=public._save_match_before_coins(p_league,p_input,p_match,p_revision,p_reason);
 perform set_config('futable.coin_defer','0',true);
 perform public._coin_match(mid); return mid;
end $$;
alter function public.admin_command(uuid,text,jsonb) rename to _admin_command_before_coins;
revoke all on function public._admin_command_before_coins(uuid,text,jsonb) from public,anon,authenticated;
create function public.admin_command(p_league uuid,p_action text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$ declare result uuid; r record; begin
 if public.member_role(p_league) is distinct from 'admin' then raise exception 'Solo administradores' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league for update;
 if p_action='season.close' and exists(select 1 from public.live_sessions where league_id=p_league and status='active') then
  raise exception 'Cierra la sesión en directo antes de cerrar la temporada';
 end if;
 perform set_config('futable.coin_defer','1',true);
 result:=public._admin_command_before_coins(p_league,p_action,p_data);
 perform set_config('futable.coin_defer','0',true);
 if p_action='match.void' then perform public._coin_match(result); end if;
 if p_action='season.configure' then
  for r in select id from public.live_sessions where league_id=p_league and status='active' loop perform public._coin_live_sync(r.id); end loop;
 end if;
 return result;
end $$;
create function public._coin_match_trigger() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if current_setting('futable.coin_defer',true) is distinct from '1' then perform public._coin_match(new.id); end if;
 return new;
end $$;
create trigger coins_match_update after update on public.matches for each row execute function public._coin_match_trigger();

create function public.coins_snapshot(p_league uuid,p_season uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare pid uuid; w uuid; result jsonb; begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501'; end if;
 if not exists(select 1 from public.seasons where id=p_season and league_id=p_league) then raise exception 'Temporada no válida'; end if;
 select id into pid from public.players where league_id=p_league and account_id=auth.uid() and active;
 select id into w from public.coin_wallets where season_id=p_season and player_id=pid;
 select jsonb_build_object(
 'settings',(select to_jsonb(c) from public.coin_settings c where league_id=p_league),
 'player_id',pid,'wallet',(select to_jsonb(c) from public.coin_wallets c where id=w),
 'standings',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('name',p.name,'avatar_url',p.avatar_url) order by c.balance desc,p.name,c.player_id) from public.coin_wallets c join public.players p on p.id=c.player_id where c.league_id=p_league and c.season_id=p_season),'[]'::jsonb),
 'ledger',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from(select * from public.coin_ledger where wallet_id=w order by created_at desc,id limit 30)x),'[]'::jsonb),
 'bets',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select b.*,m.status,m.winner,m.round from public.coin_bets b join public.coin_markets m on m.id=b.market_id where b.wallet_id=w order by b.created_at desc limit 30)x),'[]'::jsonb),
 'market',(select to_jsonb(m)||jsonb_build_object('revision',s.revision,'goals',s.state->'goals',
 'red_pool',coalesce((select sum(stake) from public.coin_bets where market_id=m.id and team='red'),0),
 'blue_pool',coalesce((select sum(stake) from public.coin_bets where market_id=m.id and team='blue'),0),
 'own_bet',(select to_jsonb(b) from public.coin_bets b where b.market_id=m.id and b.wallet_id=w))
 from public.coin_markets m join public.live_sessions s on s.id=m.session_id where m.league_id=p_league and m.season_id=p_season and m.status in ('open','locked')),
 'honours',coalesce((select jsonb_agg(to_jsonb(h) order by published_at desc) from public.season_honours h where league_id=p_league),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.coins_command(p_league uuid,p_action text,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_input->>'operation_id')::uuid; prev public.coin_actions; cfg public.coin_settings;
 s public.seasons; ls public.live_sessions; mk public.coin_markets; pid uuid; w uuid; stake int; side text; award jsonb; person jsonb; awards jsonb:='[]'; names jsonb; sig jsonb; r record;
begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501'; end if;
 if op is null then raise exception 'Falta identificador de operación'; end if;
 perform 1 from public.leagues where id=p_league for update;
 select * into prev from public.coin_actions where id=op;
 if prev.id is not null then
  if prev.league_id<>p_league or prev.actor_id<>auth.uid() or prev.payload<>jsonb_build_object('action',p_action,'input',p_input) then raise exception 'Operación distinta'; end if;
  return;
 end if;
 insert into public.coin_settings(league_id) values(p_league) on conflict do nothing;
 select * into cfg from public.coin_settings where league_id=p_league;
 if p_action in ('claim','bet') then
  select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league and status='active';
  if s.id is null or not cfg.enabled then raise exception 'Coins no disponibles en esta temporada'; end if;
  select id into pid from public.players where league_id=p_league and account_id=auth.uid() and active;
  if pid is null or public.member_role(p_league)='scoreboard' then raise exception 'Necesitas tu propia ficha de jugador'; end if;
  w:=public._coin_wallet(p_league,s.id,pid);
  if p_action='bet' then
   select * into mk from public.coin_markets where id=(p_input->>'market_id')::uuid and league_id=p_league and season_id=s.id;
   select * into ls from public.live_sessions where id=mk.session_id;
   sig:=public._coin_signature(ls.state,s.target);
   if mk.id is null or mk.status<>'open' or ls.status<>'active' or ls.revision is distinct from (p_input->>'revision')::int or sig<>mk.signature or
    greatest((ls.state#>>'{goals,red}')::int,(ls.state#>>'{goals,blue}')::int)>=(sig->>'target')::int then raise exception 'La partida ha cambiado. Actualiza antes de apostar'; end if;
   if (mk.signature->'red') ? pid::text or (mk.signature->'blue') ? pid::text then raise exception 'Solo pueden apostar espectadores'; end if;
   stake:=(p_input->>'stake')::int; side:=p_input->>'team';
   if stake is null or stake<1 or stake>cfg.max_stake or side is null or side not in ('red','blue') then raise exception 'Apuesta no válida'; end if;
   if (select balance from public.coin_wallets where id=w)<stake then raise exception 'Saldo insuficiente'; end if;
   if exists(select 1 from public.coin_bets where market_id=mk.id and wallet_id=w) then raise exception 'Ya has apostado en esta partida'; end if;
   insert into public.coin_bets(market_id,wallet_id,team,stake) values(mk.id,w,side,stake);
   perform public._coin_delta(w,-stake,'stake',mk.id);
  end if;
 elsif p_action='settings' then
  if public.member_role(p_league)<>'admin' then raise exception 'Solo administradores' using errcode='42501'; end if;
  update public.coin_settings set enabled=(p_input->>'enabled')::boolean,initial=(p_input->>'initial')::int,win_bonus=(p_input->>'win_bonus')::int,max_stake=(p_input->>'max_stake')::int where league_id=p_league;
  for r in select id from public.live_sessions where league_id=p_league and status='active' loop perform public._coin_live_sync(r.id); end loop;
 elsif p_action='publish' then
  if public.member_role(p_league)<>'admin' then raise exception 'Solo administradores' using errcode='42501'; end if;
  select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league and status='closed';
  if s.id is null then raise exception 'Cierra primero la temporada'; end if;
  if jsonb_typeof(p_input->'awards') is distinct from 'array' or jsonb_array_length(p_input->'awards') not between 1 and 12 then raise exception 'Premios no válidos'; end if;
  for award in select * from jsonb_array_elements(p_input->'awards') loop
   if length(trim(award->>'title')) not between 1 and 80 or award->>'title' is null or jsonb_typeof(award->'players') is distinct from 'array' then raise exception 'Premio no válido'; end if;
   if jsonb_array_length(award->'players') not between 1 and 100 or (select count(distinct value) from jsonb_array_elements(award->'players'))<>jsonb_array_length(award->'players') then raise exception 'Ganadores no válidos'; end if;
   names:='[]';
   for person in select * from jsonb_array_elements(award->'players') loop
    select id,name into r from public.players where league_id=p_league and id=(person#>>'{}')::uuid;
    if not found then raise exception 'Jugador ajeno a la liga'; end if;
    names:=names||jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name));
   end loop;
   awards:=awards||jsonb_build_array(jsonb_build_object('title',trim(award->>'title'),'players',names));
  end loop;
  insert into public.season_honours(season_id,league_id,awards,published_by) values(s.id,p_league,awards,auth.uid());
 else raise exception 'Acción no válida'; end if;
 insert into public.coin_actions(id,league_id,actor_id,payload) values(op,p_league,auth.uid(),jsonb_build_object('action',p_action,'input',p_input));
 if p_action in ('settings','publish') then insert into public.audit_log(league_id,actor_id,action,entity_id,after_data) values(p_league,auth.uid(),'coins.'||p_action,op,p_input); end if;
end $$;
-- Deny direct calls to every internal helper (default function ACL is PUBLIC).
do $$ declare r record; begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like '\_coin\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 end loop;
end $$;
revoke all on function public.coins_snapshot(uuid,uuid),public.coins_command(uuid,text,jsonb),public.save_match(uuid,jsonb,uuid,int,text),public.admin_command(uuid,text,jsonb) from public,anon;
grant execute on function public.coins_snapshot(uuid,uuid),public.coins_command(uuid,text,jsonb),public.save_match(uuid,jsonb,uuid,int,text),public.admin_command(uuid,text,jsonb) to authenticated;
do $$ declare r record; begin for r in select id from public.live_sessions where status='active' loop perform public._coin_live_sync(r.id); end loop; end $$;
commit;
