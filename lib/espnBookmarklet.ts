// Builds the no-install ESPN connector bookmarklet. The user drags it to their
// bookmarks bar (from the connect page) and clicks it while on their ESPN league
// page. It runs in the ESPN page's own session and:
//   1. reads the leagueId/season from the URL,
//   2. grabs the ESPN keys it can from document.cookie (SWID + ONESITE token) and
//      POSTs them to /api/espn/relay-creds — so the server can refresh them and
//      the league keeps working on the user's phone (when ESPN allows JS to read
//      the token; espn_s2 is httpOnly and unreadable here),
//   3. fetches the league data and POSTs a (stripped) snapshot to /api/espn/relay
//      so the league shows up immediately even if step 2 couldn't capture a key.
//
// The signed relay token (24h) is baked in at generation time. CORS on both
// endpoints allows the cross-origin POST from espn.com.

export const FBL_ORIGIN = "https://familybizfootball.com";

export function buildEspnBookmarklet(token: string, origin: string = FBL_ORIGIN): string {
  const T = JSON.stringify(token);
  const RELAY = JSON.stringify(`${origin}/api/espn/relay`);
  const CREDS = JSON.stringify(`${origin}/api/espn/relay-creds`);

  // Authored compactly because it lives in an href. Mirrors the extension's
  // stripEspnPayload so the server's parser sees the same shape, and keeps the
  // payload under Vercel's body limit (raw ESPN JSON is 10–20MB).
  const code = `(function(){
var T=${T},RELAY=${RELAY},CREDS=${CREDS},API="https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";
function gc(n){var m=document.cookie.match(new RegExp("(?:^|; )"+n.replace(/[.$?*|{}()\\[\\]\\\\\\/+^]/g,"\\\\$&")+"=([^;]*)"));return m?decodeURIComponent(m[1]):null;}
var u;try{u=new URL(location.href);}catch(e){u=null;}
var lid=u&&u.searchParams.get("leagueId");
var sid=u&&u.searchParams.get("seasonId");
var season=sid?Number(sid):(new Date().getMonth()>=8?new Date().getFullYear():new Date().getFullYear()-1);
if(!lid){alert("Open your ESPN fantasy LEAGUE page first (the web address should contain leagueId=...), then click this bookmark again.");return;}
var swid=gc("SWID"),tok=gc("ESPN-ONESITE.WEB-PROD.token");
function S(d){var per=d&&d.scoringPeriodId;function se(e){if(!e)return e;var pe=e.playerPoolEntry,p=pe&&pe.player;return{lineupSlotId:e.lineupSlotId,playerId:e.playerId,acquisitionType:e.acquisitionType,playerPoolEntry:pe?{acquisitionType:pe.acquisitionType,lineupLocked:pe.lineupLocked,playerPoolEntryId:pe.playerPoolEntryId,onTeamId:pe.onTeamId,appliedStatTotal:pe.appliedStatTotal,player:p?{id:p.id,fullName:p.fullName,defaultPositionId:p.defaultPositionId,proTeamId:p.proTeamId,injured:p.injured,injuryStatus:p.injuryStatus,stats:(p.stats||[]).filter(function(s){return !per||Math.abs(s.scoringPeriodId-per)<=1;}).map(function(s){return{scoringPeriodId:s.scoringPeriodId,statSourceId:s.statSourceId,appliedTotal:s.appliedTotal};})}:undefined}:undefined};}function sm(x){if(!x)return undefined;return{teamId:x.teamId,totalPoints:x.totalPoints,totalProjectedPointsLive:x.totalProjectedPointsLive,winner:x.winner,rosterForCurrentScoringPeriod:x.rosterForCurrentScoringPeriod?{entries:(x.rosterForCurrentScoringPeriod.entries||[]).map(se)}:undefined};}return{id:d.id,seasonId:d.seasonId,scoringPeriodId:d.scoringPeriodId,gameCode:d.gameCode,status:d.status,settings:d.settings,members:(d.members||[]).map(function(m){return{id:m.id,displayName:m.displayName,firstName:m.firstName,lastName:m.lastName};}),teams:(d.teams||[]).map(function(t){return{id:t.id,abbrev:t.abbrev,location:t.location,nickname:t.nickname,name:t.name,owners:t.owners,record:t.record,points:t.points,projectedPoints:t.projectedPoints,roster:t.roster?{entries:(t.roster.entries||[]).map(se)}:undefined};}),schedule:(d.schedule||[]).map(function(s){return{id:s.id,matchupPeriodId:s.matchupPeriodId,winner:s.winner,playoffTierType:s.playoffTierType,home:sm(s.home),away:sm(s.away)};})};}
var H={"Content-Type":"application/json","x-fbl-relay-token":T};
var credsP=(swid||tok)?fetch(CREDS,{method:"POST",headers:H,body:JSON.stringify({leagueId:lid,season:Number(season),swid:swid,espnToken:tok})}).catch(function(){}):Promise.resolve();
var V=["mTeam","mMatchup","mMatchupScore","mRoster","mSettings","mStandings"].map(function(v){return "view="+v;}).join("&");
var dataP=fetch(API+"/"+season+"/segments/0/leagues/"+lid+"?"+V,{credentials:"include"}).then(function(r){if(!r.ok)throw new Error("ESPN said "+r.status+" — make sure you're logged in.");return r.json();}).then(function(d){return fetch(RELAY,{method:"POST",headers:H,body:JSON.stringify({leagueId:lid,season:Number(season),data:S(d)})});}).then(function(r){return r.json().catch(function(){return{};});});
Promise.all([credsP,dataP]).then(function(res){var j=res[1]||{};alert(j.ok?"\\u2713 League "+lid+" connected to Family Biz Football! Open it on any device \\u2014 even your phone.":"Hmm, that didn't fully work: "+(j.error||"try re-grabbing the bookmarklet from FBL.")); }).catch(function(e){alert("Couldn't connect: "+e.message);});
})();`;

  return "javascript:" + code.replace(/\n/g, "");
}
