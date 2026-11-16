begin;

-- Keep accepted tickets in the same market when the first goal locks it.
create function public._coin_kickoff_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  score jsonb;
begin
  if new.status in ('open', 'locked') then
    select state->'goals' into score
    from public.live_sessions where id = new.session_id;
    new.status := case
      when score->'red' = '0'::jsonb and score->'blue' = '0'::jsonb then 'open'
      else 'locked'
    end;
  end if;
  return new;
end;
$$;

revoke all on function public._coin_kickoff_status() from public, anon, authenticated;

create trigger coin_kickoff_status
before insert or update of status on public.coin_markets
for each row execute function public._coin_kickoff_status();

update public.coin_markets set status = status where status in ('open', 'locked');

commit;
