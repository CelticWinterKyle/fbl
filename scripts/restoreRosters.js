const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../data/rosters.shortnames.json');
const dest = path.join(__dirname, '../data/rosters.json');

fs.copyFileSync(src, dest);
console.log('rosters.json has been fully restored from rosters.shortnames.json');
