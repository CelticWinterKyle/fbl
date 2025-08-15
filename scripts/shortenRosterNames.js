const fs = require('fs');
const path = require('path');

const rosterPath = path.join(__dirname, '../data/rosters.json');
const outputPath = path.join(__dirname, '../data/rosters.shortnames.json');

function shortenName(name) {
  // Ignore D/ST and bench/IR placeholders
  if (name.endsWith('D/ST') || name.startsWith('Bench Player') || name.startsWith('Injured Reserve')) {
    return name;
  }
  // Handle Jr. and multi-part last names
  const parts = name.split(' ');
  if (parts.length === 1) return name;
  let first = parts[0][0] + '.';
  let last = parts.slice(1).join(' ');
  return `${first} ${last}`;
}

function processRosters(input) {
  return input.map(team => ({
    ...team,
    roster: team.roster.map(player => ({
      ...player,
      name: shortenName(player.name)
    }))
  }));
}

const data = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
const updated = processRosters(data);
fs.writeFileSync(outputPath, JSON.stringify(updated, null, 2));
console.log('Shortened names written to', outputPath);
