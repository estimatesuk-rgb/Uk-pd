ALTER TABLE football.team_sheet_players ADD COLUMN IF NOT EXISTS played boolean NOT NULL DEFAULT false;
ALTER TABLE football.team_sheet_players ADD COLUMN IF NOT EXISTS shirt_number integer;
