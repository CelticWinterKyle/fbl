// Builds the no-install ESPN connector bookmarklet. The user drags it to their
// bookmarks bar (from the connect page) and clicks it while on their ESPN league
// page. It runs in the ESPN page's own session and:
//   1. reads the leagueId/season from the URL,
//   2. grabs the ESPN keys from document.cookie (SWID + ONESITE token + espn_s2;
//      verified 2026-08-18 that espn_s2 is NOT httpOnly and page JS reads it,
//      contrary to this file's earlier belief) and POSTs them to
//      /api/espn/relay-creds — so the server can refresh them and the league
//      keeps working on the user's phone. For a league we don't have yet this
//      is also what CREATES the connection, so it runs first,
//   3. then fetches the league data and POSTs a (stripped) snapshot to
//      /api/espn/relay so the league shows up immediately.
//
// The signed relay token (2h TTL; new connections require it under 15 min old)
// is baked in at generation time, so the intended flow is grab-and-click in one
// sitting. The connect page mints a fresh one on every visit. Bookmark sync can
// replicate the token cross-device, which is why the TTL is short and tokens
// are revocable server-side (bumpRelayTokenVersion). CORS on both endpoints
// allows the cross-origin POST from espn.com.
//
// Errors name the step they happened in and fall back to String(e), because a
// user's first report (2026-09-10, Safari or Firefox) was the literal text
// "Couldn't connect: undefined": the failure had no .message, and the old
// wording gave nobody anything to go on.

export const FBL_ORIGIN = "https://leagueblitz.app";

/** Seconds a relay token lives, and how old it may be for a NEW league. Mirrors lib/relayAuth.ts. */
const TOKEN_TTL_S = 7200;
const FRESH_TOKEN_MAX_AGE_S = 900;

export function buildEspnBookmarklet(
  token: string,
  origin: string = FBL_ORIGIN,
  /** Unix seconds the token expires (from /api/espn/relay-token). 0 = unknown, skip the local check. */
  expiresAt: number = 0
): string {
  const T = JSON.stringify(token);
  const RELAY = JSON.stringify(`${origin}/api/espn/relay`);
  const CREDS = JSON.stringify(`${origin}/api/espn/relay-creds`);
  const E = Number.isFinite(expiresAt) && expiresAt > 0 ? Math.floor(expiresAt) : 0;
  // Adding a NEW league needs the token under 15 min old: minted = expires - TTL.
  const F = E ? E - TOKEN_TTL_S + FRESH_TOKEN_MAX_AGE_S : 0;

  // espn_s2 is captured RAW (still percent-encoded): ESPN compares that cookie
  // verbatim and a decoded copy fails auth. Verified live 2026-08-18: all four
  // leagues stored a decoded s2 and every one was refused. SWID and the
  // ONESITE token are decoded as before; the token's "v=payload|sig" framing
  // only exists in the decoded form.
  // Authored compactly because it lives in an href. Mirrors the extension's
  // stripEspnPayload so the server's parser sees the same shape, and keeps the
  // payload under Vercel's body limit (raw ESPN JSON is 10–20MB).
  const code = `(function(){
var T=${T},RELAY=${RELAY},CREDS=${CREDS},E=${E},F=${F},API="https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";
function gc(n,raw){var m=document.cookie.match(new RegExp("(?:^|; )"+n.replace(/[.$?*|{}()\\[\\]\\\\\\/+^]/g,"\\\\$&")+"=([^;]*)"));return m?(raw?m[1]:decodeURIComponent(m[1])):null;}
var u;try{u=new URL(location.href);}catch(e){u=null;}
var lid=u&&u.searchParams.get("leagueId");
var sid=u&&u.searchParams.get("seasonId");
var season=sid?Number(sid):(new Date().getMonth()>=8?new Date().getFullYear():new Date().getFullYear()-1);
if(!lid){alert("Open your ESPN fantasy LEAGUE page first (the web address should contain leagueId=...), then click this bookmark again.");return;}
var now=Date.now()/1000;
var FRESH="Open League Blitz, go to Leagues, drag a fresh bookmark to your bookmarks bar, and click it within 15 minutes.";
if(E&&now>E){alert("This League Blitz bookmark has expired (they last 2 hours). "+FRESH);return;}
var swid=gc("SWID"),tok=gc("ESPN-ONESITE.WEB-PROD.token"),s2=gc("espn_s2",true);
function S(d){var per=d&&d.scoringPeriodId;function se(e){if(!e)return e;var pe=e.playerPoolEntry,p=pe&&pe.player;return{lineupSlotId:e.lineupSlotId,playerId:e.playerId,acquisitionType:e.acquisitionType,playerPoolEntry:pe?{acquisitionType:pe.acquisitionType,lineupLocked:pe.lineupLocked,playerPoolEntryId:pe.playerPoolEntryId,onTeamId:pe.onTeamId,appliedStatTotal:pe.appliedStatTotal,player:p?{id:p.id,fullName:p.fullName,defaultPositionId:p.defaultPositionId,proTeamId:p.proTeamId,injured:p.injured,injuryStatus:p.injuryStatus,stats:(p.stats||[]).filter(function(s){return !per||Math.abs(s.scoringPeriodId-per)<=1;}).map(function(s){return{scoringPeriodId:s.scoringPeriodId,statSourceId:s.statSourceId,appliedTotal:s.appliedTotal};})}:undefined}:undefined};}function sm(x){if(!x)return undefined;return{teamId:x.teamId,totalPoints:x.totalPoints,totalPointsLive:x.totalPointsLive,totalProjectedPointsLive:x.totalProjectedPointsLive,winner:x.winner,rosterForCurrentScoringPeriod:x.rosterForCurrentScoringPeriod?{entries:(x.rosterForCurrentScoringPeriod.entries||[]).map(se)}:undefined};}return{id:d.id,seasonId:d.seasonId,scoringPeriodId:d.scoringPeriodId,gameCode:d.gameCode,status:d.status,settings:d.settings,members:(d.members||[]).map(function(m){return{id:m.id,displayName:m.displayName,firstName:m.firstName,lastName:m.lastName};}),teams:(d.teams||[]).map(function(t){return{id:t.id,abbrev:t.abbrev,location:t.location,nickname:t.nickname,name:t.name,owners:t.owners,record:t.record,points:t.points,projectedPoints:t.projectedPoints,roster:t.roster?{entries:(t.roster.entries||[]).map(se)}:undefined};}),schedule:(d.schedule||[]).map(function(s){return{id:s.id,matchupPeriodId:s.matchupPeriodId,winner:s.winner,playoffTierType:s.playoffTierType,home:sm(s.home),away:sm(s.away)};})};}
var H={"Content-Type":"application/json","x-fbl-relay-token":T};
var V=["mTeam","mMatchup","mMatchupScore","mRoster","mSettings","mStandings"].map(function(v){return "view="+v;}).join("&");
var stage="saving your ESPN login";
function why(e){return (e&&(e.message||e.name))||String(e);}
function asJson(r){return r.json().catch(function(){return{ok:false,error:"bad response ("+r.status+")"};});}
function friendly(code){
if(code==="unauthorized")return "This bookmark has expired. "+FRESH;
if(code==="stale_token_for_new_connection")return "This bookmark is more than 15 minutes old, and adding a NEW league needs a fresh one. "+FRESH;
if(code==="no_credentials")return "ESPN isn't signed in on this browser. Sign in to ESPN here, then click again.";
if(code==="no_matching_connection")return "League Blitz doesn't have this league yet and couldn't read your ESPN login here. Sign in to ESPN in this browser, then click again.";
return (code||"unknown error")+". "+FRESH;}
var credsP=(swid||tok||s2)?fetch(CREDS,{method:"POST",headers:H,body:JSON.stringify({leagueId:lid,season:Number(season),swid:swid,espnToken:tok,espnS2:s2})}).then(asJson):Promise.resolve({ok:false,error:"no_credentials"});
credsP.then(function(c){
if(!c.ok&&(c.error==="unauthorized"||c.error==="stale_token_for_new_connection"||(F&&now>F))){alert(friendly(c.error||"stale_token_for_new_connection"));throw{handled:true};}
stage="reading your league from ESPN";
return fetch(API+"/"+season+"/segments/0/leagues/"+lid+"?"+V,{credentials:"include"}).then(function(r){if(!r.ok)throw new Error("ESPN said "+r.status+((r.status===401||r.status===403)?" (sign in to ESPN in this browser, then click again)":""));return r.json();}).then(function(d){stage="sending it to League Blitz";return fetch(RELAY,{method:"POST",headers:H,body:JSON.stringify({leagueId:lid,season:Number(season),data:S(d)})});}).then(asJson).then(function(j){
if(j.ok){alert("\\u2713 League "+lid+" connected to League Blitz! Open it on any device, even your phone.");return;}
var code=j.error;if(code==="no_matching_connection"&&!c.ok)code=c.error;
alert("Hmm, that didn't fully work: "+friendly(code));});
}).catch(function(e){if(e&&e.handled)return;alert("Couldn't connect while "+stage+": "+why(e)+". "+FRESH+" If it keeps failing, send us this message and the name of your browser.");});
})();`;

  return "javascript:" + code.replace(/\n/g, "");
}
