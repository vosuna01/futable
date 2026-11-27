-- Cosmetics are virtual purchases only. Sprites remain private to league members.
begin;

create table public.character_assets(player_id uuid primary key,league_id uuid not null,version text not null,data_url text not null check(left(data_url,23)='data:image/webp;base64,'),foreign key(league_id,player_id) references public.players(league_id,id));
alter table public.character_assets enable row level security;
revoke all on public.character_assets from public,anon,authenticated;
grant select on public.character_assets to authenticated;
create policy character_member_read on public.character_assets for select to authenticated using(public.member_role(league_id) is not null);
create table public.cosmetic_catalog(id text primary key,name text not null,slot text not null check(slot in ('head','face','effect','base')),cost int not null check(cost>0),enabled boolean not null default true);
insert into public.cosmetic_catalog(id,name,slot,cost) values('glasses','Gafas Pro','face',40),('cap','Gorra ABLE','head',80),('crown','Corona del Rey','head',150),('aura','Aura ABLE','effect',100),('spark','Gol Estelar','effect',60),('gold-base','Base de Oro','base',120);
alter table public.cosmetic_catalog enable row level security;revoke all on public.cosmetic_catalog from public,anon,authenticated;grant select on public.cosmetic_catalog to authenticated;
create policy catalog_read on public.cosmetic_catalog for select to authenticated using(exists(select 1 from public.league_memberships where user_id=(select auth.uid()) and active));
create table public.cosmetic_inventory(league_id uuid not null references public.leagues,user_id uuid not null references auth.users,item_id text not null references public.cosmetic_catalog,wallet_id uuid not null references public.coin_wallets,cost int not null check(cost>0),operation_id uuid not null unique,purchased_at timestamptz not null default now(),primary key(league_id,user_id,item_id));
create index inventory_wallet on public.cosmetic_inventory(wallet_id);
alter table public.cosmetic_inventory enable row level security;revoke all on public.cosmetic_inventory from public,anon,authenticated;grant select on public.cosmetic_inventory to authenticated;
create policy inventory_own on public.cosmetic_inventory for select to authenticated using(user_id=(select auth.uid()) and public.member_role(league_id) is not null);
create table public.character_loadouts(league_id uuid not null,player_id uuid primary key,items jsonb not null default '[]',updated_at timestamptz not null default now(),foreign key(league_id,player_id) references public.players(league_id,id));
alter table public.character_loadouts enable row level security;revoke all on public.character_loadouts from public,anon,authenticated;grant select on public.character_loadouts to authenticated;
create policy loadout_member on public.character_loadouts for select to authenticated using(public.member_role(league_id) is not null);
DO $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.character_loadouts;end if;end $$;
create function public._wallet_competition_score(w uuid) returns bigint language sql stable security definer set search_path='' as $$ select balance+coalesce((select sum(cost) from public.cosmetic_inventory where wallet_id=w),0) from public.coin_wallets where id=w $$;
CREATE OR REPLACE FUNCTION public._coins_snapshot_before_shop(p_league uuid, p_season uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare pid uuid; w uuid; result jsonb; begin
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
end $function$
;

create or replace function public.coins_snapshot(p_league uuid,p_season uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result:=public._coins_snapshot_before_shop(p_league,p_season);
 result:=jsonb_set(result,'{standings}',coalesce((select jsonb_agg(w||jsonb_build_object('score',public._wallet_competition_score((w->>'id')::uuid)) order by public._wallet_competition_score((w->>'id')::uuid) desc,w->>'name') from jsonb_array_elements(result->'standings') w),'[]'::jsonb));
 return result;end $$;
create function public.shop_snapshot(p_league uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare pid uuid;begin
 if public.member_role(p_league) is null then raise exception 'Sin acceso' using errcode='42501';end if;
 select id into pid from public.players where league_id=p_league and account_id=auth.uid() and active;
 return jsonb_build_object('player_id',pid,'catalog',(select jsonb_agg(c order by cost,id) from public.cosmetic_catalog c where enabled),
 'owned',coalesce((select jsonb_agg(item_id) from public.cosmetic_inventory where league_id=p_league and user_id=auth.uid()),'[]'::jsonb),
 'equipped',coalesce((select items from public.character_loadouts where player_id=pid),'[]'::jsonb));end $$;
create function public.shop_command(p_league uuid,p_action text,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_input->>'operation_id')::uuid;prior public.coin_actions;pid uuid;s public.seasons;w uuid;item public.cosmetic_catalog;items jsonb; payload jsonb:=jsonb_build_object('action','shop.'||p_action,'input',p_input);
begin
 if public.member_role(p_league) is null or public.member_role(p_league)='scoreboard' then raise exception 'Necesitas una cuenta de jugador' using errcode='42501';end if;
 if op is null then raise exception 'Falta identificador de operación';end if;
 perform 1 from public.leagues where id=p_league for update;
 select * into prior from public.coin_actions where id=op;
 if found then if prior.actor_id<>auth.uid() or prior.league_id<>p_league or prior.payload<>payload then raise exception 'Operación distinta';end if;return;end if;
 select id into pid from public.players where league_id=p_league and account_id=auth.uid() and active;
 if pid is null then raise exception 'Necesitas tu propia ficha';end if;
 if p_action='buy' then
  select * into item from public.cosmetic_catalog where id=p_input->>'item_id' and enabled for share;
  if item.id is null or item.cost is distinct from (p_input->>'expected_cost')::int then raise exception 'El precio ha cambiado. Revisa la compra';end if;
  select * into s from public.seasons where id=(p_input->>'season_id')::uuid and league_id=p_league and status='active' for share;
  if s.id is null or s.rating_epoch is null or not coalesce((select enabled from public.coin_settings where league_id=p_league),false) then raise exception 'Elige un bolsillo activo de Liga o Copa';end if;
  if exists(select 1 from public.cosmetic_inventory where league_id=p_league and user_id=auth.uid() and item_id=item.id) then raise exception 'Ya tienes este accesorio';end if;
  w:=public._coin_wallet(p_league,s.id,pid);perform 1 from public.coin_wallets where id=w for update;
  if (select balance from public.coin_wallets where id=w)<item.cost then raise exception 'Coins insuficientes';end if;
  perform public._coin_delta(w,-item.cost,'shop',op);
  insert into public.cosmetic_inventory(league_id,user_id,item_id,wallet_id,cost,operation_id) values(p_league,auth.uid(),item.id,w,item.cost,op);
 elsif p_action='equip' then
  items:=p_input->'items';
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>4 then raise exception 'Conjunto inválido';end if;
  if (select count(distinct c.slot) from jsonb_array_elements_text(items) x join public.cosmetic_catalog c on c.id=x.value join public.cosmetic_inventory i on i.item_id=c.id and i.league_id=p_league and i.user_id=auth.uid())<>jsonb_array_length(items) then raise exception 'Solo puedes equipar accesorios tuyos, uno por categoría';end if;
  insert into public.character_loadouts(league_id,player_id,items) values(p_league,pid,items) on conflict(player_id) do update set items=excluded.items,updated_at=now();
 else raise exception 'Acción de tienda desconocida';end if;
 insert into public.coin_actions(id,league_id,actor_id,payload) values(op,p_league,auth.uid(),payload);
 insert into public.audit_log(league_id,actor_id,action,entity_id,after_data) values(p_league,auth.uid(),'shop.'||p_action,op,p_input);
end $$;
revoke all on function public._wallet_competition_score(uuid),public._coins_snapshot_before_shop(uuid,uuid) from public,anon,authenticated;
revoke all on function public.shop_snapshot(uuid),public.shop_command(uuid,text,jsonb) from public,anon;
grant execute on function public.shop_snapshot(uuid),public.shop_command(uuid,text,jsonb) to authenticated;
create or replace function public.competition_command(p_league uuid,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.seasons; parent public.seasons; result uuid; oid uuid:=(p_input->>'operation_id')::uuid; prior public.operations; payload jsonb:=jsonb_build_object('competition_action',p_action,'input',p_input); names jsonb; awards jsonb; maxcoins bigint;
begin
 if public.member_role(p_league) is distinct from 'admin' then raise exception 'Solo el organizador' using errcode='42501';end if;
 if oid is null then raise exception 'Falta identificador de operación';end if;
 perform 1 from public.leagues where id=p_league for update;
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 select * into prior from public.operations where id=oid;
 if found then if prior.actor_id<>auth.uid() or prior.league_id<>p_league or prior.payload<>payload then raise exception 'Operación distinta';end if;return prior.result_id;end if;
 if p_action='reset' then
  if exists(select 1 from public.live_sessions where league_id=p_league and status='active') or exists(select 1 from public.coin_markets where league_id=p_league and status in ('open','locked')) then raise exception 'Termina las sesiones y apuestas antes del reinicio';end if;
  if (select competitions_enabled from public.leagues where id=p_league) then raise exception 'La nueva etapa ya está activada';end if;
  if (p_input->>'expected_matches')::int is distinct from (select count(*)::int from public.matches where league_id=p_league) then raise exception 'Han cambiado los resultados. Revisa el cierre de nuevo';end if;
  if (p_input->>'expected_hash') is distinct from (select md5(coalesce(string_agg(id::text||':'||revision::text||':'||status,',' order by id),'')) from public.matches where league_id=p_league) then raise exception 'Han cambiado los resultados o sus revisiones. Revisa el cierre';end if;
  select * into s from public.seasons where league_id=p_league and status='active' and competition_kind='league';
  if s.id is not null then
   perform public._competition_freeze(s.id);
   if jsonb_array_length(coalesce(p_input->'awards','[]'::jsonb))>0 and not exists(select 1 from public.season_honours where season_id=s.id) then
    perform public.coins_command(p_league,'publish',jsonb_build_object('operation_id',gen_random_uuid(),'season_id',s.id,'awards',p_input->'awards'));
   end if;
  end if;
  insert into public.seasons(league_id,name,starts_at,status,target,competition_kind,rating_epoch,minimum_days)
   values(p_league,coalesce(nullif(trim(p_input->>'name'),''),'Temporada 2 · Liga Mediodía'),(now() at time zone 'Europe/Madrid')::date,'active',3,'league',gen_random_uuid(),3) returning id into result;
  update public.leagues set competitions_enabled=true where id=p_league;
 elsif p_action='cup.create' then
  select * into parent from public.seasons where league_id=p_league and status='active' and competition_kind='league' and rating_epoch is not null;
  if parent.id is null then raise exception 'No hay una Liga activa con competiciones';end if;
  insert into public.seasons(league_id,name,starts_at,status,target,competition_kind,parent_season_id,rating_epoch,minimum_days)
   values(p_league,coalesce(nullif(trim(p_input->>'name'),''),'Copa Afterwork · '||to_char(now() at time zone 'Europe/Madrid','DD/MM/YYYY')),(now() at time zone 'Europe/Madrid')::date,'active',coalesce((p_input->>'target')::int,6),'cup',parent.id,parent.rating_epoch,0) returning id into result;
 elsif p_action='cup.cancel' then
  select * into s from public.seasons where id=(p_input->>'id')::uuid and league_id=p_league and competition_kind='cup' and status='active' for update;
  if s.id is null or s.cup_result is not null then raise exception 'La Copa no se puede cancelar';end if;
  if exists(select 1 from public.live_sessions where season_id=s.id and status='active' and jsonb_typeof(state->'court')='object') then raise exception 'Cierra primero la sesión en juego';end if;
  update public.live_sessions set status='closed' where season_id=s.id and status='active';
  perform public._competition_freeze(s.id);result:=s.id;
  update public.seasons set final_results=final_results||jsonb_build_object('cancelled',true) where id=s.id;
 elsif p_action='cup.close' then
  select * into s from public.seasons where id=(p_input->>'id')::uuid and league_id=p_league and competition_kind='cup' and status='active' for update;
  if s.id is null or s.cup_result is null then raise exception 'La Copa necesita una final decidida';end if;
  if exists(select 1 from public.live_sessions where league_id=p_league and status='active' and season_id<>s.id) then raise exception 'Hay otra sesión en la mesa';end if;
  update public.live_sessions set status='closed' where season_id=s.id and status='active';
  if exists(select 1 from public.coin_markets where season_id=s.id and status in ('open','locked')) then raise exception 'Quedan apuestas pendientes';end if;
  perform public._competition_freeze(s.id);result:=s.id;
  select jsonb_agg(jsonb_build_object('id',id,'name',name)) into names from public.players where league_id=p_league and (s.cup_result->'players') ? id::text;
  awards:=jsonb_build_array(jsonb_build_object('title','Campeones de Copa','players',names));
  select max(public._wallet_competition_score(id)) into maxcoins from public.coin_wallets where season_id=s.id;
  if maxcoins is not null then
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) into names from public.coin_wallets w join public.players p on p.id=w.player_id where w.season_id=s.id and public._wallet_competition_score(w.id)=maxcoins;
   awards:=awards||jsonb_build_array(jsonb_build_object('title','Ludópata de Copa','players',names));
  end if;
  insert into public.season_honours(season_id,league_id,awards,published_by) values(s.id,p_league,awards,auth.uid());
 else raise exception 'Acción de competición desconocida';end if;
 insert into public.operations values(oid,p_league,auth.uid(),payload,result,now());
 insert into public.audit_log(league_id,actor_id,action,entity_id,after_data) values(p_league,auth.uid(),'competition.'||p_action,result,p_input);
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.league_snapshot(p_league uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text:=public.member_role(p_league); result jsonb;
begin
 if r is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select jsonb_build_object('league',(select to_jsonb(l) from public.leagues l where id=p_league),
 'role',r,'players',coalesce((select jsonb_agg(p order by name) from public.players p where league_id=p_league),'[]'::jsonb),
 'seasons',coalesce((select jsonb_agg(s order by starts_at desc,id) from public.seasons s where league_id=p_league),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(jsonb_build_object('player_id',player_id,'team',team,'position',position) order by team,position) from public.match_participants where match_id=m.id),
  'scorers',coalesce((select jsonb_agg(jsonb_build_object('player_id',player_id,'goals',goals) order by player_id) from public.match_scorers where match_id=m.id),'[]'::jsonb)) order by played_at desc,created_at desc,id) from public.matches m where league_id=p_league),'[]'::jsonb),
 'memberships',case when r='admin' then coalesce((select jsonb_agg(jsonb_build_object('user_id',lm.user_id,'role',lm.role,'active',lm.active,'display_name',coalesce(up.display_name,'Miembro'))) from public.league_memberships lm left join public.user_profiles up using(user_id) where league_id=p_league),'[]'::jsonb) else '[]'::jsonb end,
 'loadouts',coalesce((select jsonb_object_agg(player_id,items) from public.character_loadouts where league_id=p_league),'{}'::jsonb),'series',coalesce((select jsonb_agg(x) from public.competition_series x where x.league_id=p_league),'[]'::jsonb),'audit',case when r='admin' then coalesce((select jsonb_agg(a) from (select * from public.audit_log where league_id=p_league order by created_at desc limit 200) a),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $function$
;
commit;
