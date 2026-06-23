Set-Location "h:\coding projects\repos\GameTime"

$query = @"
SELECT 
  source_id, 
  team1, 
  team2, 
  start_time
FROM matches 
WHERE game = 'valorant' 
  AND source = 'vlr'
  AND (team1 = 'KRÜ BLAZE' OR team2 = 'KRÜ BLAZE')
ORDER BY start_time, source_id;
"@

docker compose exec -T postgres psql -U gametime -d gametime -c $query
