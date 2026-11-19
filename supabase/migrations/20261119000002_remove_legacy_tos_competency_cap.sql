-- Remove the legacy four-competency trigger rule without disabling any
-- unrelated validation in the same trigger function.
do $migration$
declare
  target record;
  function_definition text;
  rewritten_definition text;
  updated_count integer := 0;
begin
  for target in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ilike '%A TOS can have up to 4 learning competencies%'
  loop
    function_definition := pg_get_functiondef(target.oid);
    rewritten_definition := regexp_replace(
      function_definition,
      '(?is)(>\s*)4(\s*THEN\s*RAISE\s+EXCEPTION\s+''A TOS can have up to 4 learning competencies)',
      E'\\1' || '200' || E'\\2',
      'i'
    );

    if rewritten_definition = function_definition then
      raise exception
        'Found legacy competency limit in %.% but could not safely rewrite its exact condition. Inspect the trigger function before applying this migration.',
        target.nspname, target.proname;
    end if;

    execute rewritten_definition;
    updated_count := updated_count + 1;
  end loop;

  if updated_count = 0 then
    raise notice 'No legacy four-competency trigger function was found; no database function needed updating.';
  else
    raise notice 'Updated % legacy competency validation function(s) to allow up to 200 rows.', updated_count;
  end if;
end
$migration$;
