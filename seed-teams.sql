-- Seeds the 'test' tournament with 29 realistic teams across 6 pools (A-E: 5 teams, F: 4 teams).
-- Teams are registered but NOT checked in, so the manager check-in UI flow can be exercised manually.
-- Re-running this script is safe: it replaces the teams array and pool/status fields only,
-- leaving header, bracket, and other tournament state untouched.

update public.tournaments
set public_state = public_state || jsonb_build_object(
  'teams', '[
    {"id":1,"pin":"1001","p1":"Mark Smith","p2":"David Lee","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":0,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":2,"pin":"1002","p1":"Sarah Johnson","p2":"Emily Carter","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":0,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":3,"pin":"1003","p1":"Kevin Brown","p2":"Justin Walker","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":0,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":4,"pin":"1004","p1":"Linda Martinez","p2":"Susan Clark","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":0,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":5,"pin":"1005","p1":"Ryan Thompson","p2":"Eric Rodriguez","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":0,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},

    {"id":6,"pin":"1006","p1":"Jessica Davis","p2":"Michelle Garcia","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":1,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":7,"pin":"1007","p1":"Brian Wilson","p2":"Timothy Moore","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":1,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":8,"pin":"1008","p1":"Amanda White","p2":"Nicole Harris","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":1,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":9,"pin":"1009","p1":"Jason Anderson","p2":"Patrick Young","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":1,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":10,"pin":"1010","p1":"Karen Robinson","p2":"Rachel Lewis","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":1,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},

    {"id":11,"pin":"1011","p1":"Scott Taylor","p2":"Henry Jackson","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":2,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":12,"pin":"1012","p1":"Melissa Adams","p2":"Stephanie King","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":2,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":13,"pin":"1013","p1":"Gary Martin","p2":"Larry Perez","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":2,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":14,"pin":"1014","p1":"Angela Campbell","p2":"Christine Mitchell","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":2,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":15,"pin":"1015","p1":"Adam Hernandez","p2":"Douglas Flores","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":2,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},

    {"id":16,"pin":"1016","p1":"Kimberly Hall","p2":"Rebecca Rivera","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":3,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":17,"pin":"1017","p1":"Jeffrey Sanchez","p2":"Frank Torres","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":3,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":18,"pin":"1018","p1":"Laura Nguyen","p2":"Megan Baker","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":3,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":19,"pin":"1019","p1":"Raymond Green","p2":"Dennis Nelson","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":3,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":20,"pin":"1020","p1":"Jerry Roberts","p2":"Aaron Allen","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":3,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},

    {"id":21,"pin":"1021","p1":"Paul Ramirez","p2":"Steven Wright","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":4,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":22,"pin":"1022","p1":"Amy Foster","p2":"Christina Brooks","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":4,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":23,"pin":"1023","p1":"Nathan Reed","p2":"Tyler Coleman","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":4,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":24,"pin":"1024","p1":"Victoria Bennett","p2":"Samantha Price","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":4,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":25,"pin":"1025","p1":"Derek Simmons","p2":"Gregory Hayes","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":4,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},

    {"id":26,"pin":"1026","p1":"Olivia Peterson","p2":"Grace Sullivan","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":5,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":27,"pin":"1027","p1":"Marcus Bryant","p2":"Alan Griffin","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":5,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":28,"pin":"1028","p1":"Natalie Ross","p2":"Diana Cook","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":5,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true},
    {"id":29,"pin":"1029","p1":"Charles Morgan","p2":"Brandon Ward","p1Locked":true,"p2Locked":true,"checkedIn":false,"p1CheckedIn":false,"p2CheckedIn":false,"pool":5,"wins":0,"losses":0,"pf":0,"pa":0,"pd":0,"active":true}
  ]'::jsonb,
  'poolCount', 6,
  'poolSize', 5,
  'expectedTeams', 29,
  'allowOddTeams', true,
  'setupMode', 'manual',
  'tournamentStarted', false,
  'status', 'setup',
  'completedMatches', '{}'::jsonb,
  'scoreReports', '{}'::jsonb,
  'courts', '{}'::jsonb,
  'stranded', '[]'::jsonb
),
updated_at = now()
where code = 'test' and event_type = 'tournament';

-- Mirror the same PINs into team_access so player-side PIN login also works for this dry run
-- (the manager UI writes these via admin-save; this keeps a direct-SQL seed consistent with it).
insert into public.team_access (tournament_id, team_id, pin_hash, score_pin)
select t.id, team->>'id', encode(digest(team->>'pin', 'sha256'), 'hex'), team->>'pin'
from public.tournaments t, jsonb_array_elements(t.public_state->'teams') as team
where t.code = 'test' and t.event_type = 'tournament'
on conflict (tournament_id, team_id) do update
set pin_hash = excluded.pin_hash,
    score_pin = excluded.score_pin;
