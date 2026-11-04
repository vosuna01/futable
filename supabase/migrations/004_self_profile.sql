-- Small JPEG avatars are stored with the league player, behind its existing RLS.
-- No public bucket, external image host, account ID or role supplied by the client.
begin;
alter table public.players drop constraint players_avatar_url_check;
alter table public.players add constraint players_avatar_url_check check (
 avatar_url is null or avatar_url ~ '^https://' or
 (length(avatar_url)<=48000 and avatar_url ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$')
);

create function public.save_my_profile(p_league uuid,p_name text,p_avatar text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); pid uuid; prior public.players; nick text:=trim(p_name);
begin
 if uid is null then raise exception 'Inicia sesión' using errcode='42501';end if;
 perform 1 from public.league_memberships where league_id=p_league and user_id=uid and active for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if nick is null or length(nick) not between 1 and 60 then raise exception 'El nombre debe tener entre 1 y 60 caracteres';end if;
 select * into prior from public.players where league_id=p_league and account_id=uid and active for update;
 if not found then raise exception 'No hay un jugador activo vinculado a tu cuenta';end if;
 if p_avatar is distinct from prior.avatar_url and p_avatar is not null and
 (length(p_avatar)>48000 or p_avatar !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$') then
  raise exception 'Selecciona una foto JPEG preparada por la aplicación';
 end if;
 pid:=prior.id;
 update public.players set name=nick,avatar_url=p_avatar where id=pid;
 insert into public.user_profiles(user_id,display_name) values(uid,nick)
 on conflict(user_id) do update set display_name=excluded.display_name;
 insert into public.audit_log(league_id,actor_id,action,entity_id,before_data,after_data)
 values(p_league,uid,'profile.update',pid,
 jsonb_build_object('name',prior.name,'has_photo',prior.avatar_url is not null),
 jsonb_build_object('name',nick,'has_photo',p_avatar is not null));
 return pid;
end $$;
revoke all on function public.save_my_profile(uuid,text,text) from public,anon;
grant execute on function public.save_my_profile(uuid,text,text) to authenticated;
commit;
