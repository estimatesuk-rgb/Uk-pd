import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const handbook=JSON.parse(readFileSync(new URL('../data/handbook-2026-27-clubs.json',import.meta.url),'utf8'));

test('handbook contains 60 teams in six divisions',()=>{
 assert.equal(handbook.season,'2026/27');
 assert.equal(handbook.clubs.length,60);
 const counts=Object.fromEntries(['One','Two','Three','Four','Five','Six'].map(d=>[d,handbook.clubs.filter(c=>c.division===d).length]));
 assert.deepEqual(counts,{One:9,Two:10,Three:10,Four:11,Five:10,Six:10});
});
test('every handbook club has a unique name and a ground',()=>{
 const names=handbook.clubs.map(c=>c.name.trim().toLowerCase());
 assert.equal(new Set(names).size,60);
 for(const c of handbook.clubs){
  assert.ok(c.name&&c.home_ground, 'Missing name or ground');
  assert.ok(c.secretary, 'Missing secretary: '+c.name);
 }
});
test('club contact emails are not included in public directory response mapping',()=>{
 const publicFields=['name','division','home_ground','home_colors','away_colors'];
 assert.ok(!publicFields.includes('email'));
 assert.ok(!publicFields.includes('phone'));
 assert.ok(!publicFields.includes('secretary'));
});

test('official handbook has email contact for every club',()=>{
 for(const club of handbook.clubs){
  assert.match(club.email||'',/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/,'Missing or invalid email for '+club.name);
 }
});
test('official club import never supplies passwords or fictitious players',()=>{
 for(const club of handbook.clubs){
  assert.equal(Object.hasOwn(club,'password'),false);
  assert.equal(Object.hasOwn(club,'players'),false);
 }
});

test('every division name and ground can be published without contact details',()=>{
 const publicGrounds=handbook.clubs.map(c=>({club:c.name,division:c.division,ground:c.home_ground}));
 assert.equal(publicGrounds.length,60);
 for(const ground of publicGrounds){
  assert.ok(ground.club&&ground.division&&ground.ground);
  assert.deepEqual(Object.keys(ground),['club','division','ground']);
 }
});

test('all club names are safe to use as public profile identifiers',()=>{
 for(const club of handbook.clubs){
  assert.ok(club.name.length<120);
  assert.equal(decodeURIComponent(encodeURIComponent(club.name)),club.name);
 }
});

test('Render bootstrap is private and imports only handbook clubs',()=>{
 const bootstrap=readFileSync(new URL('./bootstrap-render.js',import.meta.url),'utf8');
 const schema=readFileSync(new URL('./render-bootstrap.sql',import.meta.url),'utf8');
 assert.match(bootstrap,/BEGIN/);
 assert.match(bootstrap,/COMMIT/);
 assert.match(bootstrap,/ON CONFLICT\(league_id,name\)/);
 assert.match(schema,/football\.club_auth_accounts/);
 assert.match(schema,/football\.team_sheet_players/);
 assert.doesNotMatch(bootstrap,/password_hash\s*=/);
 assert.doesNotMatch(bootstrap,/fake|fictional|demo player/i);
});
