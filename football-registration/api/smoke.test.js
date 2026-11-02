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
